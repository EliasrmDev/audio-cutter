/**
 * IndexedDB schema and helpers using `idb`.
 *
 * Stores:
 *   projects      – project metadata (no blobs)
 *   audioFiles    – raw audio Blobs keyed by projectId
 *   segments      – cut-segment definitions (no buffers)
 *   exports       – completed export Blobs + metadata
 *   exportQueue   – pending export jobs (for background sync)
 */

import { openDB, IDBPDatabase } from 'idb'
import type { ExportFormat } from '@/types/export'

// ── Schema types ─────────────────────────────────────────────────────────────

export interface DBProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  durationSeconds: number
  /** selection that was active when last saved */
  selection: { start: number; end: number; duration: number } | null
}

export interface DBAudioFile {
  /** same id as the parent project */
  projectId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  blob: Blob
  storedAt: number
}

export interface DBSegment {
  id: string
  projectId: string
  name: string
  start: number
  end: number
  duration: number
  createdAt: number
}

export interface DBExport {
  id: string
  projectId: string
  segmentId: string
  name: string
  format: ExportFormat
  sizeBytes: number
  blob: Blob
  createdAt: number
}

export type ExportJobStatus = 'pending' | 'processing' | 'done' | 'error'

export interface DBExportJob {
  id: string
  projectId: string
  segmentIds: string[]
  format: ExportFormat
  status: ExportJobStatus
  error: string | null
  createdAt: number
  updatedAt: number
  /** retry count for background sync */
  retries: number
}

// ── DB version ───────────────────────────────────────────────────────────────

const DB_NAME = 'audio-cutter-db'
const DB_VERSION = 1

// ── Singleton promise ────────────────────────────────────────────────────────

let _dbPromise: Promise<IDBPDatabase<any>> | null = null

export function getDB(): Promise<IDBPDatabase<any>> {
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // projects
        if (!db.objectStoreNames.contains('projects')) {
          const ps = db.createObjectStore('projects', { keyPath: 'id' })
          ps.createIndex('updatedAt', 'updatedAt')
        }
        // audioFiles — keyed by projectId (one file per project)
        if (!db.objectStoreNames.contains('audioFiles')) {
          db.createObjectStore('audioFiles', { keyPath: 'projectId' })
        }
        // segments
        if (!db.objectStoreNames.contains('segments')) {
          const ss = db.createObjectStore('segments', { keyPath: 'id' })
          ss.createIndex('projectId', 'projectId')
        }
        // exports
        if (!db.objectStoreNames.contains('exports')) {
          const es = db.createObjectStore('exports', { keyPath: 'id' })
          es.createIndex('projectId', 'projectId')
        }
        // exportQueue
        if (!db.objectStoreNames.contains('exportQueue')) {
          const eq = db.createObjectStore('exportQueue', { keyPath: 'id' })
          eq.createIndex('status', 'status')
        }
      },
    })
  }
  return _dbPromise
}

// ── Projects ─────────────────────────────────────────────────────────────────

export async function saveProject(project: DBProject): Promise<void> {
  const db = await getDB()
  await db.put('projects', { ...project, updatedAt: Date.now() })
}

export async function getProject(id: string): Promise<DBProject | undefined> {
  const db = await getDB()
  return db.get('projects', id)
}

export async function getAllProjects(): Promise<DBProject[]> {
  const db = await getDB()
  return db.getAllFromIndex('projects', 'updatedAt')
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['projects', 'audioFiles', 'segments', 'exports'], 'readwrite')
  await Promise.all([
    tx.objectStore('projects').delete(id),
    tx.objectStore('audioFiles').delete(id),
    // Delete all segments for this project
    (async () => {
      const segs: DBSegment[] = await tx.objectStore('segments').index('projectId').getAll(id)
      await Promise.all(segs.map(s => tx.objectStore('segments').delete(s.id)))
    })(),
    // Delete all exports for this project
    (async () => {
      const exps: DBExport[] = await tx.objectStore('exports').index('projectId').getAll(id)
      await Promise.all(exps.map(e => tx.objectStore('exports').delete(e.id)))
    })(),
    tx.done,
  ])
}

// ── Audio files ───────────────────────────────────────────────────────────────

export async function saveAudioFile(record: DBAudioFile): Promise<void> {
  const db = await getDB()
  await db.put('audioFiles', record)
}

export async function getAudioFile(projectId: string): Promise<DBAudioFile | undefined> {
  const db = await getDB()
  return db.get('audioFiles', projectId)
}

export async function deleteAudioFile(projectId: string): Promise<void> {
  const db = await getDB()
  await db.delete('audioFiles', projectId)
}

// ── Segments ──────────────────────────────────────────────────────────────────

export async function saveSegment(segment: DBSegment): Promise<void> {
  const db = await getDB()
  await db.put('segments', segment)
}

export async function getSegmentsByProject(projectId: string): Promise<DBSegment[]> {
  const db = await getDB()
  return db.getAllFromIndex('segments', 'projectId', projectId)
}

export async function deleteSegment(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('segments', id)
}

// ── Exports ───────────────────────────────────────────────────────────────────

export async function saveExport(record: DBExport): Promise<void> {
  const db = await getDB()
  await db.put('exports', record)
}

export async function getExportsByProject(projectId: string): Promise<DBExport[]> {
  const db = await getDB()
  return db.getAllFromIndex('exports', 'projectId', projectId)
}

export async function deleteExport(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('exports', id)
}

// ── Export queue ──────────────────────────────────────────────────────────────

export async function enqueueExportJob(job: Omit<DBExportJob, 'status' | 'error' | 'retries' | 'updatedAt'>): Promise<DBExportJob> {
  const db = await getDB()
  const record: DBExportJob = {
    ...job,
    status: 'pending',
    error: null,
    retries: 0,
    updatedAt: Date.now(),
  }
  await db.put('exportQueue', record)
  return record
}

export async function updateExportJob(id: string, updates: Partial<DBExportJob>): Promise<void> {
  const db = await getDB()
  const existing = await db.get('exportQueue', id)
  if (!existing) return
  await db.put('exportQueue', { ...existing, ...updates, updatedAt: Date.now() })
}

export async function getPendingExportJobs(): Promise<DBExportJob[]> {
  const db = await getDB()
  return db.getAllFromIndex('exportQueue', 'status', 'pending')
}

export async function getAllExportJobs(): Promise<DBExportJob[]> {
  const db = await getDB()
  return db.getAll('exportQueue')
}

export async function clearDoneJobs(): Promise<void> {
  const db = await getDB()
  const all: DBExportJob[] = await db.getAll('exportQueue')
  const tx = db.transaction('exportQueue', 'readwrite')
  await Promise.all(
    all.filter(j => j.status === 'done' || j.status === 'error').map(j => tx.store.delete(j.id))
  )
  await tx.done
}

// ── Storage quota helper ──────────────────────────────────────────────────────

export interface StorageInfo {
  usedBytes: number
  quotaBytes: number
  percentUsed: number
}

export async function getStorageInfo(): Promise<StorageInfo | null> {
  if (!navigator.storage?.estimate) return null
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return {
      usedBytes: usage,
      quotaBytes: quota,
      percentUsed: quota > 0 ? (usage / quota) * 100 : 0,
    }
  } catch {
    return null
  }
}
