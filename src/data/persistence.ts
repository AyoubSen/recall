import type { DisplayPrefs, Filters, SwipeRecord, Title, TitleStatus, Viewer } from '../types'

export const STORAGE_KEY = 'recall.state.v1'
export const DISCOVERY_KEY = 'recall.discovery.v1'
export const SCHEMA_VERSION = 4

/**
 * Persisted shape.
 *
 * `titles` holds the *essential* record for every classified title and is
 * never pruned — a classification the user made must always remain visible in
 * Library, Profile, recommendation exclusions, search and exports. Rich but
 * re-fetchable fields (overview, backdrop, vote counts) are deliberately not
 * persisted: the deck gets them live from discovery, and dropping them keeps
 * each stored record small enough that localStorage stays viable.
 */
export interface PersistedState {
  version: number
  onboarded: boolean
  statuses: Record<string, { status: TitleStatus; at: number }>
  titles: Record<string, EssentialTitle>
  history: SwipeRecord[]
  filters: Filters
  prefs: DisplayPrefs
  /** Fitted by the calibration round; drives viewer-relative deck ordering. */
  viewer: Viewer
  legacyReconciled?: boolean
}

/**
 * The minimum needed to render and analyse a classified title without any
 * network access. Everything here is required; nothing here is ever pruned.
 */
export interface EssentialTitle {
  id: string
  source: Title['source']
  tmdbId?: number
  type: Title['type']
  title: string
  year: number
  posterUrl?: string
  genres: string[]
  language: string
  languageCode?: string
  rating: number
  popularity: number
  runtime?: number
  seasons?: number
  director?: string
  cast?: string[]
  franchise?: string
  detailed?: boolean
}

/** Strips a full Title down to the fields that must survive forever. */
export function essentialOf(t: Title): EssentialTitle {
  const e: EssentialTitle = {
    id: t.id,
    source: t.source,
    type: t.type,
    title: t.title,
    year: t.year,
    genres: t.genres,
    language: t.language,
    rating: t.rating,
    popularity: t.popularity,
  }
  if (t.tmdbId != null) e.tmdbId = t.tmdbId
  if (t.posterUrl) e.posterUrl = t.posterUrl
  if (t.languageCode) e.languageCode = t.languageCode
  if (t.runtime != null) e.runtime = t.runtime
  if (t.seasons != null) e.seasons = t.seasons
  if (t.director) e.director = t.director
  if (t.cast?.length) e.cast = t.cast
  if (t.franchise) e.franchise = t.franchise
  if (t.detailed) e.detailed = true
  return e
}

/** Rehydrates an essential record into the Title shape the UI consumes. */
export function toTitle(e: EssentialTitle): Title {
  return {
    ...e,
    overview: '',
  }
}

/** Keeps whichever record carries more information, field by field. */
export function mergeEssential(a: EssentialTitle, b: EssentialTitle): EssentialTitle {
  const pick = <K extends keyof EssentialTitle>(k: K): EssentialTitle[K] => {
    const av = a[k]
    const bv = b[k]
    if (Array.isArray(av) && Array.isArray(bv)) return (av.length >= bv.length ? av : bv) as EssentialTitle[K]
    if (av === undefined || av === '' || av === 0) return bv
    if (bv === undefined || bv === '' || bv === 0) return av
    return b.detailed && !a.detailed ? bv : av
  }
  return {
    ...a,
    ...b,
    id: a.id,
    title: pick('title') as string,
    year: pick('year') as number,
    posterUrl: pick('posterUrl') as string | undefined,
    genres: pick('genres') as string[],
    rating: pick('rating') as number,
    popularity: pick('popularity') as number,
    runtime: pick('runtime') as number | undefined,
    seasons: pick('seasons') as number | undefined,
    director: pick('director') as string | undefined,
    cast: pick('cast') as string[] | undefined,
    franchise: pick('franchise') as string | undefined,
    detailed: a.detailed || b.detailed,
  }
}

/* ------------------------------------------------------------------- write */

export type SaveResult = { ok: true } | { ok: false; reason: string }

/**
 * Writes the whole state. There is deliberately no "drop old records to make
 * room" path: losing a classification silently is worse than failing loudly,
 * so a quota failure is reported to the caller instead.
 */
export function saveState(state: PersistedState): SaveResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return { ok: true }
  } catch (err) {
    const quota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return {
      ok: false,
      reason: quota
        ? 'This browser’s storage for ReelDeck is full.'
        : 'This browser refused to save ReelDeck’s data.',
    }
  }
}

/** Rough byte size of the persisted payload, for diagnostics. */
export function measureState(state: PersistedState): number {
  return new Blob([JSON.stringify(state)]).size
}
