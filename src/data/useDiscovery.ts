import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { catalogProvider } from './provider'
import { describeError } from './tmdb/client'
import { rankDeck } from './ranking'
import type { Filters, MediaType, Title, TitleStatus } from '../types'

/**
 * Buffered, paginated discovery.
 *
 * Keeps a ranked queue of unresolved candidates ahead of the current card and
 * fetches further pages before it runs low, so the deck never stalls and never
 * pulls the whole catalogue at once.
 */

/** Refill once fewer than this many unresolved candidates remain queued. */
const LOW_WATER = 40
/** Stop fetching once the queue holds at least this many. */
const TARGET = 60
/**
 * Candidates are ranked in windows rather than per API page, so ordering is
 * decided across several pages instead of 20 rows at a time.
 */
const RANK_WINDOW = 40
/** Hard stop per refill so one pump cannot spin through hundreds of pages. */
const MAX_PAGES_PER_PUMP = 8

const PROGRESS_KEY = 'recall.discovery.v1'
/** Only the newest few filter combinations keep their page cursors. */
const MAX_TRACKED_FILTERS = 4

export function filterKey(f: Filters): string {
  return JSON.stringify([
    [...f.types].sort(),
    f.yearFrom,
    f.yearTo,
    [...f.genres].sort(),
    [...f.languages].sort(),
    f.popularity,
  ])
}

type Progress = Record<string, { movie: number; tv: number; at: number }>

function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') as Progress
  } catch {
    return {}
  }
}

function saveProgress(key: string, pages: { movie: number; tv: number }) {
  try {
    const all = loadProgress()
    all[key] = { ...pages, at: Date.now() }
    const trimmed = Object.entries(all)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_TRACKED_FILTERS)
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(trimmed)))
  } catch {
    /* progress is a nicety, never fatal */
  }
}

interface Bucket {
  /** Last page successfully consumed. Next fetch is page + 1. */
  page: number
  exhausted: boolean
  /** How many candidates this source has contributed, for balancing. */
  contributed: number
}

interface Internals {
  key: string
  movie: Bucket
  tv: Bucket
  /** Ranked, ordered, ready to show. */
  queue: Title[]
  /** Fetched but not yet ranked. */
  staging: Title[]
  seenIds: Set<string>
  requested: Set<string>
  pumping: boolean
}

function freshInternals(key: string, resume?: { movie: number; tv: number }): Internals {
  return {
    key,
    movie: { page: resume?.movie ?? 0, exhausted: false, contributed: 0 },
    tv: { page: resume?.tv ?? 0, exhausted: false, contributed: 0 },
    queue: [],
    staging: [],
    seenIds: new Set(),
    requested: new Set(),
    pumping: false,
  }
}

export interface DiscoveryState {
  /** Ranked unresolved candidates, current card first. */
  deck: Title[]
  loading: boolean
  error: string | null
  exhausted: boolean
  retry: () => void
  /** Total candidates fetched this session, for diagnostics in the UI. */
  fetched: number
}

export function useDiscovery(
  filters: Filters,
  statuses: Record<string, { status: TitleStatus }>,
): DiscoveryState {
  const key = useMemo(() => filterKey(filters), [filters])

  const ref = useRef<Internals>(freshInternals(key))
  const [, forceRender] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState(false)

  // Statuses are read inside the pump without re-creating it on every swipe.
  const statusesRef = useRef(statuses)
  statusesRef.current = statuses

  const abortRef = useRef<AbortController | null>(null)

  /** Ranks whatever is staged and appends it to the ordered queue. */
  const flushStaging = useCallback((force: boolean) => {
    const st = ref.current
    if (!st.staging.length) return
    if (!force && st.staging.length < RANK_WINDOW) return
    const ranked = rankDeck(st.staging, st.queue.slice(-6))
    st.queue = st.queue.concat(ranked)
    st.staging = []
  }, [])

  const unresolvedCount = useCallback(() => {
    const s = statusesRef.current
    return ref.current.queue.filter((t) => !s[t.id]).length
  }, [])

  const pump = useCallback(async () => {
    const st = ref.current
    if (st.pumping) return
    if (st.movie.exhausted && st.tv.exhausted) {
      flushStaging(true)
      setExhausted(unresolvedCount() === 0)
      forceRender((n) => n + 1)
      return
    }

    st.pumping = true
    setLoading(true)
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller
    const myKey = st.key

    try {
      let pages = 0
      while (
        unresolvedCount() + st.staging.length < TARGET &&
        pages < MAX_PAGES_PER_PUMP &&
        !(st.movie.exhausted && st.tv.exhausted)
      ) {
        // Pick the source: only the requested types, and whichever has
        // contributed less so far, so "Both" never drains one type first.
        const wantMovie = filters.types.includes('movie') && !st.movie.exhausted
        const wantTv = filters.types.includes('series') && !st.tv.exhausted
        if (!wantMovie && !wantTv) {
          st.movie.exhausted = true
          st.tv.exhausted = true
          break
        }
        let type: MediaType
        if (wantMovie && wantTv) type = st.movie.contributed <= st.tv.contributed ? 'movie' : 'series'
        else type = wantMovie ? 'movie' : 'series'

        const bucket = type === 'movie' ? st.movie : st.tv
        const nextPage = bucket.page + 1
        const reqId = `${type}:${nextPage}`

        // Guards against StrictMode double-invocation and any repeat fetch of
        // a page already requested for this filter combination.
        if (st.requested.has(reqId)) {
          bucket.page = nextPage
          continue
        }
        st.requested.add(reqId)

        if (nextPage > catalogProvider.maxPages) {
          bucket.exhausted = true
          continue
        }

        const res = await catalogProvider.getDiscoveryTitles({
          filters,
          type,
          page: nextPage,
          signal: controller.signal,
        })

        // A filter change happened mid-flight; drop this response entirely.
        if (ref.current.key !== myKey) return

        pages++
        bucket.page = nextPage
        if (res.exhausted) bucket.exhausted = true

        const s = statusesRef.current
        let added = 0
        for (const t of res.items) {
          if (st.seenIds.has(t.id)) continue // already in queue/staging
          if (s[t.id]) continue // already classified
          st.seenIds.add(t.id)
          st.staging.push(t)
          added++
        }
        bucket.contributed += added

        flushStaging(false)
        saveProgress(st.key, { movie: st.movie.page, tv: st.tv.page })
      }

      flushStaging(st.movie.exhausted && st.tv.exhausted)
      setExhausted(st.movie.exhausted && st.tv.exhausted && unresolvedCount() === 0)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      // A network failure is never treated as the end of the catalogue.
      setError(describeError(err))
    } finally {
      if (ref.current.key === myKey) {
        st.pumping = false
        setLoading(false)
        forceRender((n) => n + 1)
      }
    }
  }, [filters, flushStaging, unresolvedCount])

  // Reset when the filter combination changes; resume its saved page cursors.
  useEffect(() => {
    abortRef.current?.abort()
    const saved = loadProgress()[key]
    ref.current = freshInternals(key, saved ? { movie: saved.movie, tv: saved.tv } : undefined)
    setError(null)
    setExhausted(false)
    forceRender((n) => n + 1)
    void pump()
    return () => abortRef.current?.abort()
    // `pump` is recreated with filters, which is exactly when we want a reset.
  }, [key, pump])

  // Top up whenever swiping has eaten into the buffer.
  const deck = useMemo(
    () => ref.current.queue.filter((t) => !statuses[t.id]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statuses, ref.current.queue.length, loading, error],
  )

  useEffect(() => {
    if (loading || error) return
    if (deck.length < LOW_WATER) void pump()
  }, [deck.length, loading, error, pump])

  const retry = useCallback(() => {
    setError(null)
    void pump()
  }, [pump])

  return {
    deck,
    loading,
    error,
    exhausted: exhausted && deck.length === 0,
    retry,
    fetched: ref.current.seenIds.size,
  }
}
