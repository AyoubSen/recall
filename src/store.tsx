import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CATALOG } from './data/catalog'
import { catalogProvider, usingTmdb } from './data/provider'
import {
  DISCOVERY_KEY,
  SCHEMA_VERSION,
  STORAGE_KEY,
  essentialOf,
  measureState,
  saveState,
  toTitle,
  type EssentialTitle,
  type PersistedState,
} from './data/persistence'
import { applyBackup, downloadBackup, type BackupFile, type ImportMode } from './data/backup'
import { clearCalibrationCache } from './data/calibration'
import { DEFAULT_VIEWER, blendViewers, fitFromHistory } from './data/viewer'
import type {
  DisplayPrefs,
  Filters,
  SwipeRecord,
  TasteProfile,
  Title,
  TitleStatus,
  Viewer,
} from './types'

export const CURRENT_YEAR = 2026
export const YEAR_MIN = 1950
export const YEAR_MAX = CURRENT_YEAR

export const DEFAULT_FILTERS: Filters = {
  types: ['movie', 'series'],
  yearFrom: YEAR_MIN,
  yearTo: YEAR_MAX,
  genres: [],
  languages: [],
  popularity: 'balanced',
}

/** Classifications between refits of the live viewer. See `liveViewer`. */
const REFIT_EVERY = 10

const DEFAULT_PREFS: DisplayPrefs = {
  libraryView: 'grid',
  librarySort: 'recent',
  showNotWatched: false,
}

const initialState: PersistedState = {
  version: SCHEMA_VERSION,
  onboarded: false,
  statuses: {},
  titles: {},
  history: [],
  filters: DEFAULT_FILTERS,
  prefs: DEFAULT_PREFS,
  viewer: DEFAULT_VIEWER,
}

/* --------------------------------------------------------------- migration */

const LOCAL_BY_ID = new Map(CATALOG.map((t) => [t.id, t]))

/**
 * v1 stored only statuses keyed by local catalogue ids and no title metadata.
 * v2 adds the title cache and stable compound ids. Legacy ids that cannot be
 * confidently matched to TMDB are preserved as `source: 'legacy'` records
 * rather than dropped, so nothing the user classified is ever lost.
 */
function migrate(raw: Partial<PersistedState> & Record<string, unknown>): PersistedState {
  const version = typeof raw.version === 'number' ? raw.version : 1
  const statuses = (raw.statuses ?? {}) as PersistedState['statuses']
  const titles: Record<string, EssentialTitle> = {
    ...((raw.titles ?? {}) as Record<string, EssentialTitle>),
  }

  if (version < 2) {
    // Hydrate metadata for every classified local title from the bundled
    // catalogue, marking them legacy so they survive independently of it.
    for (const id of Object.keys(statuses)) {
      if (titles[id]) continue
      const local = LOCAL_BY_ID.get(id)
      if (local) titles[id] = essentialOf({ ...local, source: 'legacy' })
    }
  }

  // v2 stored whole Title objects, including re-fetchable fields. v3 keeps
  // only the essential record, which is never pruned. Nothing is lost that
  // Library, Profile, exclusions or exports depend on.
  for (const [id, t] of Object.entries(titles)) {
    titles[id] = essentialOf(t as unknown as Title)
  }

  return {
    ...initialState,
    ...raw,
    version: SCHEMA_VERSION,
    statuses,
    titles,
    history: (raw.history ?? []) as SwipeRecord[],
    filters: { ...DEFAULT_FILTERS, ...((raw.filters ?? {}) as Partial<Filters>) },
    prefs: { ...DEFAULT_PREFS, ...((raw.prefs ?? {}) as Partial<DisplayPrefs>) },
    // v3 and earlier predate the viewer model. Those users stay on the global
    // fame ordering they already had until they run a calibration round.
    viewer: { ...DEFAULT_VIEWER, ...((raw.viewer ?? {}) as Partial<Viewer>) },
  }
}

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState
    return migrate(JSON.parse(raw))
  } catch {
    return initialState
  }
}

/* ------------------------------------------------------------------- store */

interface Store extends PersistedState {
  sessionCount: number
  usingTmdb: boolean
  statusOf: (id: string) => TitleStatus
  /** Records a status and caches the title's metadata alongside it. */
  setStatus: (title: Title, status: TitleStatus) => void
  setStatusById: (id: string, status: TitleStatus) => void
  undo: () => void
  resetStatus: (id: string) => void
  setFilters: (f: Filters) => void
  setPrefs: (p: Partial<DisplayPrefs>) => void
  /** Replaces the fitted viewer. Re-ranks the deck via the discovery key. */
  setViewer: (v: Viewer) => void
  completeOnboarding: (f: Filters) => void
  resetAll: () => void
  resetOnboarding: () => void
  resetStatuses: () => void
  seedSampleHistory: () => void
  /**
   * The viewer the deck should actually rank with: the calibration fit refined
   * by everything swiped since. `viewer` remains the calibration answer alone.
   */
  liveViewer: Viewer
  /** Classifications currently feeding `liveViewer`. */
  liveViewerSample: number
  /** Set when the last save failed; null while persistence is healthy. */
  storageError: string | null
  exportData: () => void
  importBackup: (backup: BackupFile, mode: ImportMode) => void
  /** Approximate persisted size in bytes, for the storage diagnostics row. */
  storageBytes: number
  watchedCount: number
  titlesByStatus: (s: TitleStatus) => Title[]
  profile: TasteProfile
  /** All classified titles, for genre/decade filter options. */
  knownTitles: Title[]
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(load)
  const [sessionCount, setSessionCount] = useState(0)
  const [storageError, setStorageError] = useState<string | null>(null)

  // Persist on every change. A failure is surfaced rather than "fixed" by
  // dropping records — the session keeps working in memory and the user is
  // told their latest changes may not survive a reload.
  useEffect(() => {
    const res = saveState(state)
    setStorageError((prev) => {
      if (res.ok) return null
      // Same failure twice in a row must not re-render or re-notify.
      return prev === res.reason ? prev : res.reason
    })
  }, [state])

  const statusOf = useCallback(
    (id: string): TitleStatus => state.statuses[id]?.status ?? 'unresolved',
    [state.statuses],
  )

  const setStatus = useCallback((title: Title, status: TitleStatus) => {
    setState((s) => {
      const previousStatus = s.statuses[title.id]?.status ?? 'unresolved'
      if (previousStatus === status) return s
      const at = Date.now()
      return {
        ...s,
        statuses: { ...s.statuses, [title.id]: { status, at } },
        // Keep the richer of the two records if details arrived later.
        titles: {
          ...s.titles,
          [title.id]: { ...(s.titles[title.id] ?? {}), ...essentialOf(title) },
        },
        history: [
          ...s.history,
          { titleId: title.id, status, previousStatus, at },
        ].slice(-200),
      }
    })
    setSessionCount((c) => c + 1)
  }, [])

  const setStatusById = useCallback(
    (id: string, status: TitleStatus) => {
      setState((s) => {
        const known = s.titles[id]
        if (!known) return s
        const previousStatus = s.statuses[id]?.status ?? 'unresolved'
        if (previousStatus === status) return s
        const at = Date.now()
        return {
          ...s,
          statuses: { ...s.statuses, [id]: { status, at } },
          history: [...s.history, { titleId: id, status, previousStatus, at }].slice(-200),
        }
      })
      setSessionCount((c) => c + 1)
    },
    [],
  )

  const undo = useCallback(() => {
    setState((s) => {
      const last = s.history[s.history.length - 1]
      if (!last) return s
      const statuses = { ...s.statuses }
      if (last.previousStatus === 'unresolved') delete statuses[last.titleId]
      else statuses[last.titleId] = { status: last.previousStatus, at: last.at }
      return { ...s, statuses, history: s.history.slice(0, -1) }
    })
    setSessionCount((c) => Math.max(0, c - 1))
  }, [])

  const resetStatus = useCallback((id: string) => {
    setState((s) => {
      const statuses = { ...s.statuses }
      delete statuses[id]
      return { ...s, statuses, history: s.history.filter((h) => h.titleId !== id) }
    })
  }, [])

  const setFilters = useCallback((filters: Filters) => setState((s) => ({ ...s, filters })), [])

  const setPrefs = useCallback(
    (p: Partial<DisplayPrefs>) => setState((s) => ({ ...s, prefs: { ...s.prefs, ...p } })),
    [],
  )

  const setViewer = useCallback((viewer: Viewer) => setState((s) => ({ ...s, viewer })), [])

  const completeOnboarding = useCallback(
    (filters: Filters) => setState((s) => ({ ...s, filters, onboarded: true })),
    [],
  )

  const resetAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(DISCOVERY_KEY)
    clearCalibrationCache()
    setState(initialState)
    setSessionCount(0)
    setStorageError(null)
  }, [])

  /** Sends the user back through onboarding, calibration included. */
  const resetOnboarding = useCallback(() => {
    clearCalibrationCache()
    setState((s) => ({ ...s, onboarded: false, viewer: DEFAULT_VIEWER }))
  }, [])

  const resetStatuses = useCallback(() => {
    localStorage.removeItem(DISCOVERY_KEY)
    setState((s) => ({ ...s, statuses: {}, titles: {}, history: [] }))
    setSessionCount(0)
  }, [])

  /** Deterministic sample history from the bundled catalogue. */
  const seedSampleHistory = useCallback(() => {
    const statuses: PersistedState['statuses'] = {}
    const titles: Record<string, EssentialTitle> = {}
    const base = Date.now() - 1000 * 60 * 60 * 24 * 30
    const cycle: TitleStatus[] = [
      'watched',
      'watched',
      'watched',
      'not_watched',
      'watched',
      'watchlist',
      'watched',
      'unsure',
      'not_watched',
      'watched',
    ]
    CATALOG.forEach((t, i) => {
      if (t.popularity < 55) return
      statuses[t.id] = { status: cycle[i % cycle.length], at: base + i * 60_000 }
      titles[t.id] = essentialOf(t)
    })
    setState((s) => ({ ...s, statuses, titles, history: [], onboarded: true }))
    setSessionCount(0)
  }, [])

  const exportData = useCallback(() => downloadBackup(state), [state])

  const importBackup = useCallback((backup: BackupFile, mode: ImportMode) => {
    setState((s) => applyBackup(s, backup, mode))
    setSessionCount(0)
    // Imported titles are already classified, so the deck must rebuild its
    // candidate pool rather than keep showing them.
    localStorage.removeItem(DISCOVERY_KEY)
  }, [])

  const storageBytes = useMemo(() => measureState(state), [state])

  const knownTitles = useMemo(
    () => Object.values(state.titles).map(toTitle),
    [state.titles],
  )

  const titlesByStatus = useCallback(
    (want: TitleStatus) =>
      knownTitles
        .filter((t) => state.statuses[t.id]?.status === want)
        .sort((a, b) => (state.statuses[b.id]?.at ?? 0) - (state.statuses[a.id]?.at ?? 0)),
    [knownTitles, state.statuses],
  )

  const watched = useMemo(
    () => titlesByStatus('watched'),
    [titlesByStatus],
  )

  const profile = useMemo<TasteProfile>(() => {
    const genreCount = new Map<string, number>()
    const decadeCount = new Map<string, number>()
    const peopleCount = new Map<string, { count: number; role: 'director' | 'actor' }>()
    let runtime = 0
    let ratingSum = 0
    let rated = 0

    for (const w of watched) {
      for (const g of w.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1)
      if (w.year) {
        const d = `${Math.floor(w.year / 10) * 10}s`
        decadeCount.set(d, (decadeCount.get(d) ?? 0) + 1)
      }
      if (w.director) {
        const cur = peopleCount.get(w.director)
        peopleCount.set(w.director, { count: (cur?.count ?? 0) + 1, role: 'director' })
      }
      for (const c of w.cast ?? []) {
        if (c === 'Various') continue
        const cur = peopleCount.get(c)
        peopleCount.set(c, { count: (cur?.count ?? 0) + 1, role: cur?.role ?? 'actor' })
      }
      runtime += w.runtime ?? (w.type === 'series' ? (w.seasons ?? 2) * 8 * 45 : 110)
      if (w.rating) {
        ratingSum += w.rating
        rated++
      }
    }

    return {
      moviesWatched: watched.filter((w) => w.type === 'movie').length,
      seriesWatched: watched.filter((w) => w.type === 'series').length,
      genres: [...genreCount.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      decades: [...decadeCount.entries()]
        .map(([decade, count]) => ({ decade, count }))
        .sort((a, b) => b.count - a.count || a.decade.localeCompare(b.decade)),
      people: [...peopleCount.entries()]
        .map(([name, v]) => ({ name, count: v.count, role: v.role }))
        .filter((p) => p.count > 1)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      averageRating: rated ? ratingSum / rated : 0,
      totalRuntimeMinutes: runtime,
      watchedIds: watched.map((w) => w.id),
    }
  }, [watched])

  /**
   * The live viewer, refit on a cadence rather than on every swipe.
   *
   * Each refit re-ranks the pending deck, so recomputing per swipe would keep
   * the queue permanently in motion. The memo is keyed on a bucketed count, so
   * it recomputes once every REFIT_EVERY classifications and is otherwise free.
   */
  const classifiedCount = Object.keys(state.statuses).length
  const refitBucket = Math.floor(classifiedCount / REFIT_EVERY)

  const { liveViewer, liveViewerSample } = useMemo(
    () => {
      const fit = fitFromHistory(knownTitles, state.statuses)
      return { liveViewer: blendViewers(state.viewer, fit), liveViewerSample: fit.sample }
    },
    // Intentionally *not* keyed on knownTitles: that changes on every swipe and
    // would defeat the cadence. When the bucket does flip, the memo recomputes
    // against the current titles and statuses anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refitBucket, state.viewer],
  )

  /* ------------------------------------------------ legacy id reconciliation */

  const reconciling = useRef(false)

  useEffect(() => {
    if (!usingTmdb || state.legacyReconciled || reconciling.current) return
    const legacy = Object.values(state.titles).filter((t) => t.source === 'legacy')
    if (!legacy.length) {
      setState((s) => ({ ...s, legacyReconciled: true }))
      return
    }

    // Runs once per page load. Deliberately not aborted on cleanup: under
    // StrictMode the first mount is torn down immediately, and aborting there
    // would cancel the only pass the ref guard allows.
    reconciling.current = true

    ;(async () => {
      const remap = new Map<string, EssentialTitle>()
      for (const t of legacy) {
        try {
          const res = await catalogProvider.searchTitles(t.title, 1)
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
          // Confident match only: same media type, identical normalized title,
          // year within one. Anything ambiguous is left as a legacy record.
          const hit = res.items.find(
            (c) =>
              c.type === t.type &&
              norm(c.title) === norm(t.title) &&
              c.year > 0 &&
              Math.abs(c.year - t.year) <= 1,
          )
          const ambiguous =
            res.items.filter(
              (c) => c.type === t.type && norm(c.title) === norm(t.title) && Math.abs(c.year - t.year) <= 1,
            ).length > 1
          if (hit && !ambiguous) {
            remap.set(
              t.id,
              essentialOf({
                ...hit,
                runtime: t.runtime ?? hit.runtime,
                seasons: t.seasons ?? hit.seasons,
                director: t.director ?? hit.director,
                cast: t.cast ?? hit.cast,
              }),
            )
          }
        } catch {
          // Leave this one legacy and continue with the rest.
        }
      }

      setState((s) => {
        const statuses = { ...s.statuses }
        const titles = { ...s.titles }
        for (const [oldId, next] of remap) {
          if (!statuses[oldId]) continue
          // Never clobber a status the user already set on the TMDB record.
          if (!statuses[next.id]) statuses[next.id] = statuses[oldId]
          delete statuses[oldId]
          delete titles[oldId]
          titles[next.id] = next
        }
        const history = s.history.map((h) =>
          remap.has(h.titleId) ? { ...h, titleId: remap.get(h.titleId)!.id } : h,
        )
        return { ...s, statuses, titles, history, legacyReconciled: true }
      })
    })()
  }, [state.legacyReconciled, state.titles])

  const value: Store = {
    ...state,
    sessionCount,
    usingTmdb,
    statusOf,
    setStatus,
    setStatusById,
    undo,
    resetStatus,
    setFilters,
    setPrefs,
    setViewer,
    completeOnboarding,
    resetAll,
    resetOnboarding,
    resetStatuses,
    seedSampleHistory,
    liveViewer,
    liveViewerSample,
    storageError,
    exportData,
    importBackup,
    storageBytes,
    watchedCount: watched.length,
    titlesByStatus,
    profile,
    knownTitles,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used inside StoreProvider')
  return v
}
