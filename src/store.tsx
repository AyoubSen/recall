import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { CATALOG, YEAR_MAX, YEAR_MIN } from './data/catalog'
import { matchesFilters } from './data/provider'
import { rankDeck } from './data/ranking'
import type {
  DisplayPrefs,
  Filters,
  SwipeRecord,
  TasteProfile,
  Title,
  TitleStatus,
} from './types'

const KEY = 'recall.state.v1'

export const DEFAULT_FILTERS: Filters = {
  types: ['movie', 'series'],
  yearFrom: YEAR_MIN,
  yearTo: YEAR_MAX,
  genres: [],
  languages: [],
  popularity: 'balanced',
}

const DEFAULT_PREFS: DisplayPrefs = {
  libraryView: 'grid',
  librarySort: 'recent',
  showNotWatched: false,
}

interface PersistedState {
  onboarded: boolean
  statuses: Record<string, { status: TitleStatus; at: number }>
  history: SwipeRecord[]
  filters: Filters
  prefs: DisplayPrefs
}

const initialState: PersistedState = {
  onboarded: false,
  statuses: {},
  history: [],
  filters: DEFAULT_FILTERS,
  prefs: DEFAULT_PREFS,
}

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initialState
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      ...initialState,
      ...parsed,
      filters: { ...DEFAULT_FILTERS, ...(parsed.filters ?? {}) },
      prefs: { ...DEFAULT_PREFS, ...(parsed.prefs ?? {}) },
    }
  } catch {
    return initialState
  }
}

interface Store extends PersistedState {
  /** Titles sorted in *this* browser session — deliberately not persisted. */
  sessionCount: number
  statusOf: (id: string) => TitleStatus
  setStatus: (id: string, status: TitleStatus) => void
  undo: () => void
  resetStatus: (id: string) => void
  setFilters: (f: Filters) => void
  setPrefs: (p: Partial<DisplayPrefs>) => void
  completeOnboarding: (f: Filters) => void
  resetAll: () => void
  resetOnboarding: () => void
  resetStatuses: () => void
  seedSampleHistory: () => void
  deck: Title[]
  watchedCount: number
  titlesByStatus: (s: TitleStatus) => Title[]
  profile: TasteProfile
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(load)
  const [sessionCount, setSessionCount] = useState(0)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state))
  }, [state])

  const statusOf = useCallback(
    (id: string): TitleStatus => state.statuses[id]?.status ?? 'unresolved',
    [state.statuses],
  )

  const setStatus = useCallback((id: string, status: TitleStatus) => {
    setState((s) => {
      const previousStatus = s.statuses[id]?.status ?? 'unresolved'
      if (previousStatus === status) return s
      return {
        ...s,
        statuses: { ...s.statuses, [id]: { status, at: Date.now() } },
        history: [...s.history, { titleId: id, status, previousStatus, at: Date.now() }].slice(-200),
      }
    })
    setSessionCount((c) => c + 1)
  }, [])

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

  const completeOnboarding = useCallback(
    (filters: Filters) => setState((s) => ({ ...s, filters, onboarded: true })),
    [],
  )

  const resetAll = useCallback(() => {
    localStorage.removeItem(KEY)
    setState(initialState)
    setSessionCount(0)
  }, [])

  const resetOnboarding = useCallback(
    () => setState((s) => ({ ...s, onboarded: false })),
    [],
  )

  const resetStatuses = useCallback(() => {
    setState((s) => ({ ...s, statuses: {}, history: [] }))
    setSessionCount(0)
  }, [])

  /**
   * Deterministic sample history, for exercising Profile and For You without
   * swiping through the whole catalogue by hand. Same result every time.
   */
  const seedSampleHistory = useCallback(() => {
    const statuses: PersistedState['statuses'] = {}
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
    })
    setState((s) => ({ ...s, statuses, history: [], onboarded: true }))
    setSessionCount(0)
  }, [])

  /** Unresolved titles matching the current filters, recognition-first. */
  const deck = useMemo(
    () =>
      rankDeck(
        CATALOG.filter((x) => !state.statuses[x.id] && matchesFilters(x, state.filters)),
      ),
    [state.statuses, state.filters],
  )

  const titlesByStatus = useCallback(
    (s: TitleStatus) =>
      CATALOG.filter((x) => state.statuses[x.id]?.status === s).sort(
        (a, b) => (state.statuses[b.id]?.at ?? 0) - (state.statuses[a.id]?.at ?? 0),
      ),
    [state.statuses],
  )

  const watched = useMemo(
    () => CATALOG.filter((x) => state.statuses[x.id]?.status === 'watched'),
    [state.statuses],
  )

  const profile = useMemo<TasteProfile>(() => {
    const genreCount = new Map<string, number>()
    const decadeCount = new Map<string, number>()
    const peopleCount = new Map<string, { count: number; role: 'director' | 'actor' }>()
    let runtime = 0
    let ratingSum = 0

    for (const w of watched) {
      for (const g of w.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1)
      const d = `${Math.floor(w.year / 10) * 10}s`
      decadeCount.set(d, (decadeCount.get(d) ?? 0) + 1)
      if (w.director) {
        const cur = peopleCount.get(w.director)
        peopleCount.set(w.director, { count: (cur?.count ?? 0) + 1, role: 'director' })
      }
      for (const c of w.cast) {
        if (c === 'Various') continue
        const cur = peopleCount.get(c)
        peopleCount.set(c, { count: (cur?.count ?? 0) + 1, role: cur?.role ?? 'actor' })
      }
      runtime += w.runtime ?? (w.seasons ?? 1) * 8 * 45
      ratingSum += w.rating
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
      averageRating: watched.length ? ratingSum / watched.length : 0,
      totalRuntimeMinutes: runtime,
    }
  }, [watched])

  const value: Store = {
    ...state,
    sessionCount,
    resetOnboarding,
    resetStatuses,
    seedSampleHistory,
    statusOf,
    setStatus,
    undo,
    resetStatus,
    setFilters,
    setPrefs,
    completeOnboarding,
    resetAll,
    deck,
    watchedCount: watched.length,
    titlesByStatus,
    profile,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used inside StoreProvider')
  return v
}
