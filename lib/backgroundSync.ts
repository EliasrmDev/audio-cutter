/**
 * lib/backgroundSync.ts
 *
 * Background Sync integration:
 *   - Registers pending export jobs with the Background Sync API when available.
 *   - Falls back to a manual retry loop (polling with exponential back-off) when
 *     the API is not supported or the app is in the foreground.
 *
 * Export processing is intentionally decoupled: this module only manages
 * job state in IndexedDB and triggers the SW tag. The actual encoding lives
 * in lib/audioExporter.ts.
 */

import {
  getPendingExportJobs,
  updateExportJob,
  clearDoneJobs,
  enqueueExportJob,
  type DBExportJob,
} from '@/lib/db'
import type { ExportFormat } from '@/types/export'

// ── Constants ─────────────────────────────────────────────────────────────────

const SYNC_TAG = 'audio-cutter-export-sync'
const MAX_RETRIES = 3
const RETRY_BASE_MS = 2_000

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'done'

export interface SyncState {
  status: SyncStatus
  pendingCount: number
  lastSyncAt: number | null
  lastError: string | null
}

type SyncStateListener = (state: SyncState) => void

// ── Internal state ─────────────────────────────────────────────────────────────

let _state: SyncState = {
  status: 'idle',
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,
}

const _listeners = new Set<SyncStateListener>()

function setState(patch: Partial<SyncState>) {
  _state = { ..._state, ...patch }
  _listeners.forEach(l => l(_state))
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function getSyncState(): SyncState {
  return { ..._state }
}

export function subscribeSyncState(listener: SyncStateListener): () => void {
  _listeners.add(listener)
  listener(_state) // emit current state immediately
  return () => _listeners.delete(listener)
}

/**
 * Register an export job for background sync.
 * If the Background Sync API is available, registers a SW sync tag.
 * Otherwise, schedules the manual fallback.
 */
export async function scheduleExport(params: {
  projectId: string
  segmentIds: string[]
  format: ExportFormat
}): Promise<DBExportJob> {
  const job = await enqueueExportJob({
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    projectId: params.projectId,
    segmentIds: params.segmentIds,
    format: params.format,
    createdAt: Date.now(),
  })

  await _refreshPendingCount()

  if (await _tryRegisterBackgroundSync()) {
    // SW will handle it via the 'sync' event
    return job
  }

  // Fallback: manual retry when online
  _scheduleManualRetry()
  return job
}

/**
 * Manually trigger sync (call on app foreground / network restore).
 * No-op if already syncing.
 */
export async function triggerManualSync(
  processor?: (job: DBExportJob) => Promise<void>
): Promise<void> {
  if (_state.status === 'syncing') return
  await _processPending(processor)
}

/** Remove completed and errored jobs from the queue. */
export async function clearFinishedJobs(): Promise<void> {
  await clearDoneJobs()
  await _refreshPendingCount()
}

// ── Internal ───────────────────────────────────────────────────────────────────

async function _tryRegisterBackgroundSync(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker?.ready
    if (!reg) return false
    // SyncManager is not in all TS lib defs — cast to any
    const sm = (reg as any).sync
    if (!sm) return false
    await sm.register(SYNC_TAG)
    return true
  } catch {
    return false
  }
}

let _retryTimer: ReturnType<typeof setTimeout> | null = null

function _scheduleManualRetry(delayMs = 3_000) {
  if (_retryTimer) return
  _retryTimer = setTimeout(async () => {
    _retryTimer = null
    if (!navigator.onLine) {
      // Not online yet — schedule again when connection is restored
      window.addEventListener('online', () => _scheduleManualRetry(500), { once: true })
      return
    }
    await triggerManualSync()
  }, delayMs)
}

async function _processPending(
  processor?: (job: DBExportJob) => Promise<void>
): Promise<void> {
  const pending = await getPendingExportJobs()
  if (pending.length === 0) {
    setState({ status: 'idle', pendingCount: 0 })
    return
  }

  setState({ status: 'syncing', pendingCount: pending.length })

  let hadError = false

  for (const job of pending) {
    await updateExportJob(job.id, { status: 'processing' })

    try {
      if (processor) {
        await processor(job)
      }
      await updateExportJob(job.id, { status: 'done' })
    } catch (err) {
      hadError = true
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      const retries = (job.retries ?? 0) + 1

      if (retries >= MAX_RETRIES) {
        await updateExportJob(job.id, { status: 'error', error: errorMsg, retries })
      } else {
        // Back to pending for retry
        const backoff = RETRY_BASE_MS * Math.pow(2, retries)
        await updateExportJob(job.id, { status: 'pending', error: errorMsg, retries })
        setTimeout(() => _scheduleManualRetry(backoff), 0)
      }
    }
  }

  const remaining = await getPendingExportJobs()
  setState({
    status: hadError ? 'error' : 'done',
    pendingCount: remaining.length,
    lastSyncAt: Date.now(),
    lastError: hadError ? 'Some jobs failed — will retry' : null,
  })
}

async function _refreshPendingCount(): Promise<void> {
  const pending = await getPendingExportJobs()
  setState({ pendingCount: pending.length })
}

// ── Notification helpers ───────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const perm = await Notification.requestPermission()
  return perm === 'granted'
}

export function sendLocalNotification(title: string, body: string, icon = '/icon-192.png') {
  if (Notification.permission !== 'granted') return
  try {
    // If SW is active, use it for richer notifications
    navigator.serviceWorker?.ready.then(reg => {
      reg.showNotification(title, { body, icon, badge: '/icon-192.png' })
    }).catch(() => {
      new Notification(title, { body, icon })
    })
  } catch {
    new Notification(title, { body, icon })
  }
}
