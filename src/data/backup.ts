import type { SwipeRecord, TitleStatus } from '../types'
import {
  SCHEMA_VERSION,
  mergeEssential,
  type EssentialTitle,
  type PersistedState,
} from './persistence'

export const BACKUP_FORMAT = 'recall.backup'
export const BACKUP_VERSION = 1

/**
 * A backup is everything the user owns and nothing else: no tokens, no
 * environment values, no discovery caches, no in-flight or loading state.
 */
export interface BackupFile {
  format: typeof BACKUP_FORMAT
  formatVersion: number
  exportedAt: string
  appSchemaVersion: number
  onboarded: boolean
  filters: PersistedState['filters']
  prefs: PersistedState['prefs']
  statuses: PersistedState['statuses']
  titles: Record<string, EssentialTitle>
  history: SwipeRecord[]
}

export function buildBackup(state: PersistedState): BackupFile {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appSchemaVersion: state.version ?? SCHEMA_VERSION,
    onboarded: state.onboarded,
    filters: state.filters,
    prefs: state.prefs,
    statuses: state.statuses,
    titles: state.titles,
    history: state.history,
  }
}

export function backupFilename(date = new Date()): string {
  const iso = date.toISOString().slice(0, 10)
  return `recall-backup-${iso}.json`
}

export function downloadBackup(state: PersistedState) {
  const blob = new Blob([JSON.stringify(buildBackup(state), null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFilename()
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click has definitely been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/* -------------------------------------------------------------- validation */

export interface BackupSummary {
  exportedAt: string | null
  watched: number
  not_watched: number
  watchlist: number
  unsure: number
  titles: number
  historyEntries: number
}

export type ValidationResult =
  | { ok: true; backup: BackupFile; summary: BackupSummary }
  | { ok: false; error: string }

const STATUSES: TitleStatus[] = ['watched', 'not_watched', 'watchlist', 'unsure', 'unresolved']

/**
 * Validates a candidate file completely before any state is touched. Returns a
 * specific reason on failure so the user knows what is wrong with the file.
 */
export function validateBackup(raw: string): ValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'That file does not contain a Recall backup.' }
  }

  const b = parsed as Partial<BackupFile>

  if (b.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      error: 'That is not a Recall backup file (missing the Recall format marker).',
    }
  }
  if (typeof b.formatVersion !== 'number') {
    return { ok: false, error: 'This backup has no format version and cannot be read.' }
  }
  if (b.formatVersion > BACKUP_VERSION) {
    return {
      ok: false,
      error: `This backup was made by a newer version of Recall (format v${b.formatVersion}, this app reads up to v${BACKUP_VERSION}).`,
    }
  }
  if (typeof b.statuses !== 'object' || b.statuses === null || Array.isArray(b.statuses)) {
    return { ok: false, error: 'This backup is missing its list of classified titles.' }
  }
  if (typeof b.titles !== 'object' || b.titles === null || Array.isArray(b.titles)) {
    return { ok: false, error: 'This backup is missing its title metadata.' }
  }

  // Per-entry validation: one malformed record invalidates the file rather
  // than being silently imported as junk.
  for (const [id, entry] of Object.entries(b.statuses)) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !STATUSES.includes((entry as { status: TitleStatus }).status) ||
      typeof (entry as { at: number }).at !== 'number'
    ) {
      return { ok: false, error: `This backup has a damaged status record (“${id}”).` }
    }
  }
  for (const [id, t] of Object.entries(b.titles)) {
    if (
      typeof t !== 'object' ||
      t === null ||
      typeof (t as EssentialTitle).id !== 'string' ||
      typeof (t as EssentialTitle).title !== 'string' ||
      ((t as EssentialTitle).type !== 'movie' && (t as EssentialTitle).type !== 'series')
    ) {
      return { ok: false, error: `This backup has a damaged title record (“${id}”).` }
    }
  }

  const history = Array.isArray(b.history) ? (b.history as SwipeRecord[]) : []
  const counts = { watched: 0, not_watched: 0, watchlist: 0, unsure: 0 }
  for (const entry of Object.values(b.statuses)) {
    const s = entry.status
    if (s in counts) counts[s as keyof typeof counts]++
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      formatVersion: b.formatVersion,
      exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : '',
      appSchemaVersion: typeof b.appSchemaVersion === 'number' ? b.appSchemaVersion : 2,
      onboarded: b.onboarded !== false,
      filters: b.filters as BackupFile['filters'],
      prefs: b.prefs as BackupFile['prefs'],
      statuses: b.statuses,
      titles: b.titles as Record<string, EssentialTitle>,
      history,
    },
    summary: {
      exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : null,
      ...counts,
      titles: Object.keys(b.titles).length,
      historyEntries: history.length,
    },
  }
}

/* ------------------------------------------------------------------ restore */

export type ImportMode = 'replace' | 'merge'

const historyKey = (h: SwipeRecord) => `${h.titleId}|${h.status}|${h.previousStatus}|${h.at}`

/**
 * Produces the next state from a validated backup.
 *
 * Replace adopts the backup wholesale. Merge matches on the stable compound id
 * only — no guessing between unrelated legacy ids — keeps the classification
 * with the newer timestamp, and keeps the more complete metadata regardless of
 * which side won the status.
 */
export function applyBackup(
  current: PersistedState,
  backup: BackupFile,
  mode: ImportMode,
): PersistedState {
  if (mode === 'replace') {
    return {
      ...current,
      version: SCHEMA_VERSION,
      onboarded: backup.onboarded,
      filters: backup.filters ?? current.filters,
      prefs: backup.prefs ?? current.prefs,
      statuses: { ...backup.statuses },
      titles: { ...backup.titles },
      history: [...backup.history],
    }
  }

  const statuses = { ...current.statuses }
  for (const [id, incoming] of Object.entries(backup.statuses)) {
    const existing = statuses[id]
    // Newer classification wins; ties keep what is already here.
    if (!existing || incoming.at > existing.at) statuses[id] = incoming
  }

  const titles = { ...current.titles }
  for (const [id, incoming] of Object.entries(backup.titles)) {
    const existing = titles[id]
    titles[id] = existing ? mergeEssential(existing, incoming) : incoming
  }

  const seen = new Set<string>()
  const history = [...current.history, ...backup.history]
    .filter((h) => {
      const k = historyKey(h)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    // Undo walks from the end, so ordering must stay chronological.
    .sort((a, b) => a.at - b.at)
    .slice(-200)

  return {
    ...current,
    version: SCHEMA_VERSION,
    onboarded: current.onboarded || backup.onboarded,
    statuses,
    titles,
    history,
  }
}
