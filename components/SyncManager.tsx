'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { RefreshCw, CheckCircle2, AlertCircle, Clock, Trash2, HardDrive } from 'lucide-react'
import { clsx } from 'clsx'
import {
  getSyncState,
  subscribeSyncState,
  triggerManualSync,
  clearFinishedJobs,
  type SyncState,
} from '@/lib/backgroundSync'
import { getCacheStatus, requestPersistentStorage, hasPersistentStorage, type CacheStatus } from '@/lib/cacheManager'
import { getAllExportJobs, type DBExportJob } from '@/lib/db'
import { Button } from '@/components/ui'
import { formatBytes } from '@/lib/audioExporter'

interface SyncManagerProps {
  className?: string
}

export function SyncManager({ className }: SyncManagerProps) {
  const [syncState, setSyncState]         = useState<SyncState>(getSyncState())
  const [cacheStatus, setCacheStatus]     = useState<CacheStatus | null>(null)
  const [jobs, setJobs]                   = useState<DBExportJob[]>([])
  const [isPersistent, setIsPersistent]   = useState<boolean | null>(null)
  const [expanded, setExpanded]           = useState(false)

  // ── Subscribe to sync state ─────────────────────────────────────────────────
  useEffect(() => {
    return subscribeSyncState(setSyncState)
  }, [])

  // ── Refresh jobs + cache on expand ──────────────────────────────────────────
  const refresh = useCallback(async () => {
    const [allJobs, status, persistent] = await Promise.all([
      getAllExportJobs(),
      getCacheStatus(),
      hasPersistentStorage(),
    ])
    setJobs(allJobs)
    setCacheStatus(status)
    setIsPersistent(persistent)
  }, [])

  useEffect(() => {
    if (expanded) refresh()
  }, [expanded, refresh])

  // ── Refresh jobs whenever sync completes ────────────────────────────────────
  useEffect(() => {
    if (syncState.status === 'done' || syncState.status === 'error') {
      refresh()
    }
  }, [syncState.status, refresh])

  const handleSync = useCallback(async () => {
    await triggerManualSync()
    await refresh()
  }, [refresh])

  const handleClearFinished = useCallback(async () => {
    await clearFinishedJobs()
    await refresh()
  }, [refresh])

  const handleRequestPersist = useCallback(async () => {
    const ok = await requestPersistentStorage()
    setIsPersistent(ok)
  }, [])

  // ── Badge ───────────────────────────────────────────────────────────────────
  const hasPending = syncState.pendingCount > 0
  const isError    = syncState.status === 'error'
  const isSyncing  = syncState.status === 'syncing'

  return (
    <div className={clsx('rounded-xl border border-border bg-background-secondary', className)}>
      {/* ── Header (always visible) ──────────────────────────────────────────── */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-controls="sync-manager-body"
      >
        <div className="flex items-center gap-2">
          <RefreshCw
            size={15}
            className={clsx('text-primary', isSyncing && 'animate-spin')}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-foreground">Sync &amp; Storage</span>

          {/* Pending badge */}
          {hasPending && (
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-[10px] font-bold text-white"
              aria-label={`${syncState.pendingCount} pending`}
            >
              {syncState.pendingCount}
            </span>
          )}
          {isError && !hasPending && (
            <AlertCircle size={14} className="text-red-400" aria-label="Sync error" />
          )}
        </div>

        <span className="text-xs text-foreground-muted" aria-hidden="true">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      {expanded && (
        <div id="sync-manager-body" className="px-4 pb-4 space-y-4 border-t border-border pt-4">

          {/* Sync status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              {isSyncing && <RefreshCw size={13} className="animate-spin text-primary" aria-hidden="true" />}
              {syncState.status === 'done'  && <CheckCircle2 size={13} className="text-green-400" aria-hidden="true" />}
              {syncState.status === 'error' && <AlertCircle  size={13} className="text-red-400"   aria-hidden="true" />}
              {syncState.status === 'idle'  && <Clock        size={13} className="text-foreground-muted" aria-hidden="true" />}
              <span className="text-foreground-secondary capitalize">{syncState.status}</span>
              {syncState.pendingCount > 0 && (
                <span className="text-xs text-foreground-muted">({syncState.pendingCount} pending)</span>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={handleSync} disabled={isSyncing} aria-label="Trigger manual sync">
              <RefreshCw size={13} className={clsx(isSyncing && 'animate-spin')} aria-hidden="true" />
              <span className="ml-1">Sync now</span>
            </Button>
          </div>

          {/* Error message */}
          {syncState.lastError && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-md px-3 py-2" role="alert">
              {syncState.lastError}
            </p>
          )}

          {/* Storage info */}
          {cacheStatus && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-foreground-secondary">
                <span className="flex items-center gap-1">
                  <HardDrive size={12} aria-hidden="true" />
                  Storage
                </span>
                <span className="tabular-nums">
                  {cacheStatus.formattedUsed} / {cacheStatus.formattedQuota}
                </span>
              </div>
              {cacheStatus.info && (
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(cacheStatus.info.percentUsed)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Storage ${Math.round(cacheStatus.info.percentUsed)}% used`}
                  className="relative h-1.5 rounded-full bg-background-tertiary overflow-hidden"
                >
                  <div
                    className={clsx(
                      'h-full rounded-full transition-all',
                      cacheStatus.isCritical ? 'bg-red-500' :
                      cacheStatus.isNearLimit ? 'bg-amber-500' : 'bg-primary'
                    )}
                    style={{ width: `${Math.min(100, cacheStatus.info.percentUsed)}%` }}
                  />
                </div>
              )}
              {cacheStatus.isNearLimit && (
                <p className="text-xs text-amber-400" role="alert">
                  {cacheStatus.isCritical
                    ? 'Storage critical: old exports will be removed automatically.'
                    : 'Storage is getting full. Consider deleting old exports.'}
                </p>
              )}
            </div>
          )}

          {/* Persistent storage */}
          {isPersistent === false && (
            <div className="flex items-center justify-between bg-background-tertiary rounded-lg px-3 py-2">
              <p className="text-xs text-foreground-secondary">
                Enable persistent storage to prevent the browser from clearing your data.
              </p>
              <Button size="sm" variant="secondary" onClick={handleRequestPersist} className="ml-2 shrink-0">
                Enable
              </Button>
            </div>
          )}

          {/* Jobs list */}
          {jobs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-foreground-secondary uppercase tracking-wide">
                  Export jobs
                </h4>
                <Button size="sm" variant="ghost" onClick={handleClearFinished} className="text-xs">
                  <Trash2 size={11} className="mr-1" aria-hidden="true" />
                  Clear finished
                </Button>
              </div>
              <ul className="space-y-1" aria-label="Export job queue">
                {jobs.map(job => (
                  <li
                    key={job.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded bg-background-tertiary text-xs"
                  >
                    <JobStatusIcon status={job.status} />
                    <span className="flex-1 truncate text-foreground-secondary">
                      {job.format.toUpperCase()} · {job.segmentIds.length} segment{job.segmentIds.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-foreground-muted tabular-nums capitalize">{job.status}</span>
                    {job.retries > 0 && (
                      <span className="text-foreground-muted tabular-nums">×{job.retries}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function JobStatusIcon({ status }: { status: DBExportJob['status'] }) {
  switch (status) {
    case 'done':       return <CheckCircle2 size={12} className="text-green-400 shrink-0" aria-label="Done" />
    case 'error':      return <AlertCircle  size={12} className="text-red-400 shrink-0"   aria-label="Error" />
    case 'processing': return <RefreshCw    size={12} className="text-primary animate-spin shrink-0" aria-label="Processing" />
    default:           return <Clock        size={12} className="text-foreground-muted shrink-0" aria-label="Pending" />
  }
}
