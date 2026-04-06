/**
 * lib/cacheManager.ts
 *
 * Smart storage management for IndexedDB (audio blobs, export blobs).
 * Implements a simple LRU-ish eviction strategy: oldest-accessed exports are
 * purged first when approaching the quota limit.
 *
 * Audio blobs for the *current project* are never evicted automatically;
 * only completed export records can be removed.
 */

import {
  getStorageInfo,
  getAllProjects,
  deleteProject,
  getExportsByProject,
  deleteExport,
  StorageInfo,
} from '@/lib/db'

// ── Constants ────────────────────────────────────────────────────────────────

/** Warn when used > this fraction of quota */
const WARN_THRESHOLD = 0.8

/** Start evicting exports when used > this fraction */
const EVICT_THRESHOLD = 0.9

/** Hard limit on total audio-file storage (1 GB) */
const HARD_LIMIT_BYTES = 1024 * 1024 * 1024

// ── Public API ────────────────────────────────────────────────────────────────

export interface CacheStatus {
  info: StorageInfo | null
  isNearLimit: boolean
  isCritical: boolean
  formattedUsed: string
  formattedQuota: string
}

/** Returns current storage status. Safe to call frequently (no DB writes). */
export async function getCacheStatus(): Promise<CacheStatus> {
  const info = await getStorageInfo()
  const used  = info?.usedBytes ?? 0
  const quota = info?.quotaBytes ?? HARD_LIMIT_BYTES
  const pct   = quota > 0 ? used / quota : 0

  return {
    info,
    isNearLimit: pct > WARN_THRESHOLD,
    isCritical:  pct > EVICT_THRESHOLD,
    formattedUsed:  formatBytes(used),
    formattedQuota: formatBytes(quota),
  }
}

/**
 * Runs eviction if we are over the eviction threshold.
 * Deletes oldest completed exports first; if still over threshold,
 * deletes oldest inactive projects (those not in `activeProjectId`).
 *
 * Returns the number of records deleted.
 */
export async function runEvictionIfNeeded(activeProjectId?: string): Promise<number> {
  const info = await getStorageInfo()
  if (!info) return 0

  const pct = info.usedBytes / info.quotaBytes
  if (pct <= EVICT_THRESHOLD) return 0

  let deleted = 0

  // 1. Delete old exports across all projects
  const projects = await getAllProjects()
  const exportsByAge: Array<{ projectId: string; exportId: string; createdAt: number }> = []

  for (const project of projects) {
    const exps = await getExportsByProject(project.id)
    for (const e of exps) {
      exportsByAge.push({ projectId: project.id, exportId: e.id, createdAt: e.createdAt })
    }
  }

  // Sort oldest first
  exportsByAge.sort((a, b) => a.createdAt - b.createdAt)

  for (const { exportId } of exportsByAge) {
    await deleteExport(exportId)
    deleted++
    const current = await getStorageInfo()
    if (!current || current.usedBytes / current.quotaBytes <= WARN_THRESHOLD) break
  }

  // 2. If still critical, delete inactive projects (not the active one)
  const fresh = await getStorageInfo()
  if (fresh && fresh.usedBytes / fresh.quotaBytes > EVICT_THRESHOLD) {
    const sortedProjects = projects
      .filter(p => p.id !== activeProjectId)
      .sort((a, b) => a.updatedAt - b.updatedAt)

    for (const project of sortedProjects) {
      await deleteProject(project.id)
      deleted++
      const after = await getStorageInfo()
      if (!after || after.usedBytes / after.quotaBytes <= EVICT_THRESHOLD) break
    }
  }

  return deleted
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Requests persistent storage from the browser.
 * Persistent storage is NOT evicted by the browser under storage pressure.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function hasPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false
  try {
    return await navigator.storage.persisted()
  } catch {
    return false
  }
}
