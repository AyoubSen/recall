import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { catalogProvider, usingTmdb } from './provider'
import { voteLadder } from './providers/tmdb'
import { describeError } from './tmdb/client'
import { rankDeck } from './ranking'
import { hasSignal } from './viewer'
import type { Filters, MediaType, Title, TitleStatus, Viewer } from '../types'

/**
 * Buffered, paginated discovery.
 *
 * Each media type is an independent source with its own ladder position, page
 * cursor, total_pages, exhausted flag and in-flight flag. The deck is only
 * "cleared" once every *enabled* source is proven finished — which means it has
 * walked every rung of the vote-count ladder, and either passed TMDB's reported
 * total_pages on the last rung or gone a bounded run of pages without yielding
 * a single usable candidate.
 *
 * Explicitly NOT exhaustion: hitting the per-cycle work limit, a page whose
 * rows were all duplicates or already classified, or any network failure.
 */

const LOW_WATER = 40
const TARGET = 60
const RANK_WINDOW = 40
/** Bounded work per refill cycle. Hitting it schedules another cycle. */
const MAX_PAGES_PER_CYCLE = 8
/** Consecutive zero-yield pages before a rung is considered mined out. */
const NO_PROGRESS_LIMIT = 10
/** Safety bound on fast-forwarding over already-requested page numbers. */
const MAX_SKIPS_PER_CYCLE = 40

const PROGRESS_KEY = 'recall.discovery.v1'
/** v2 keys embedded the viewer; those entries are stale now that it is excluded. */
const PROGRESS_VERSION = 3
const MAX_TRACKED_FILTERS = 4

/**
 * Identity of a deck configuration.
 *
 * Deliberately *excludes* the viewer. Page cursors record which TMDB pages have
 * been fetched, which is a question about the catalogue, not about how the
 * results were ordered. Since the viewer is now refit continuously, folding it
 * in here would restart paging every few swipes. A viewer change instead
 * re-ranks the already-buffered queue in place — see `rankRevision`.
 */
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

/** Stable identity of a viewer's effect on ordering. */
function viewerSignature(v?: Viewer): string {
  return hasSignal(v) ? `${v.birthYear}|${[...v.markets].sort().join(',')}|${v.confidence}` : ''
}

/**
 * Cards at the head of the queue that a re-rank must not disturb — the visible
 * card and its immediate successors, which would otherwise change under the
 * user's finger mid-swipe.
 */
const RERANK_KEEP = 3

/** Every Nth slot ignores the viewer, so no bucket can starve permanently. */
const EXPLORE_EVERY = 7

/**
 * Interleave a viewer-ranked ordering with an unbiased one.
 *
 * The rate-based fit is robust to *unequal* exposure but cannot recover a bucket
 * with *zero* exposure — no exposure means no rate, and no rate means nothing to
 * revise the fit with. Reserving a slot for the globally-ranked candidate keeps
 * every bucket sampled, so the fit can always be corrected by evidence.
 */
function withExploration(titles: Title[], seed: Title[], viewer?: Viewer): Title[] {
  if (!hasSignal(viewer)) return rankDeck(titles, seed)

  const tuned = rankDeck(titles, seed, viewer)
  const explore = rankDeck(titles, seed)
  const used = new Set<string>()
  const out: Title[] = []
  let ti = 0
  let ei = 0

  while (out.length < tuned.length) {
    const exploring = out.length > 0 && out.length % EXPLORE_EVERY === 0
    const from = exploring ? explore : tuned
    const cursor = exploring ? () => ei++ : () => ti++
    let picked: Title | undefined
    while (!picked) {
      const idx = cursor()
      if (idx >= from.length) break
      if (!used.has(from[idx].id)) picked = from[idx]
    }
    // The preferred list is exhausted of unused entries; take from the other.
    if (!picked) picked = tuned.find((t) => !used.has(t.id)) ?? explore.find((t) => !used.has(t.id))
    if (!picked) break
    used.add(picked.id)
    out.push(picked)
  }

  return out
}

/* ---------------------------------------------------------------- progress */

interface Cursor {
  tier: number
  page: number
}
interface ProgressEntry {
  movie: Cursor
  tv: Cursor
  at: number
}
interface ProgressFile {
  version: number
  entries: Record<string, ProgressEntry>
}

const ladderLength = (f: Filters, type: MediaType) => voteLadder(f.popularity, type).length

/**
 * Reads and repairs stored progress.
 *
 * v1 stored a bare page number per type under the old single-tier logic, whose
 * cursors could be left deep inside a rung that had been wrongly declared the
 * end of the catalogue. Those are migrated to tier 0 and clamped; no exhausted
 * flag has ever been persisted, and none is now, so a stale one cannot survive
 * a reload.
 */
function loadProgress(): Record<string, ProgressEntry> {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return {}

    // v1 shape: { "<key>": { movie: number, tv: number, at } }
    if (typeof raw.version !== 'number') {
      const out: Record<string, ProgressEntry> = {}
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const e = v as { movie?: unknown; tv?: unknown; at?: unknown }
        out[k] = {
          movie: { tier: 0, page: clampPage(e.movie) },
          tv: { tier: 0, page: clampPage(e.tv) },
          at: typeof e.at === 'number' ? e.at : Date.now(),
        }
      }
      return out
    }

    // v2 keys embedded the viewer, so they can never match a v3 filterKey and
    // would only crowd out live entries. Drop them rather than carry them.
    if (raw.version !== PROGRESS_VERSION) return {}

    const entries = (raw as ProgressFile).entries ?? {}
    const out: Record<string, ProgressEntry> = {}
    for (const [k, v] of Object.entries(entries)) {
      out[k] = {
        movie: clampCursor(v?.movie),
        tv: clampCursor(v?.tv),
        at: typeof v?.at === 'number' ? v.at : Date.now(),
      }
    }
    return out
  } catch {
    return {}
  }
}

function clampPage(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0
  return Math.max(0, Math.min(n, catalogProvider.maxPages))
}

function clampCursor(c: unknown): Cursor {
  const o = (c ?? {}) as { tier?: unknown; page?: unknown }
  const tier = typeof o.tier === 'number' && Number.isFinite(o.tier) ? Math.max(0, Math.floor(o.tier)) : 0
  return { tier, page: clampPage(o.page) }
}

function saveProgress(key: string, movie: Cursor, tv: Cursor) {
  try {
    const entries = loadProgress()
    entries[key] = { movie: { ...movie }, tv: { ...tv }, at: Date.now() }
    const trimmed = Object.entries(entries)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_TRACKED_FILTERS)
    const file: ProgressFile = { version: PROGRESS_VERSION, entries: Object.fromEntries(trimmed) }
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(file))
  } catch {
    /* progress is a nicety, never fatal */
  }
}

/* --------------------------------------------------------------- internals */

interface Source {
  type: MediaType
  tier: number
  /** Last page consumed on the current tier. Next fetch is page + 1. */
  page: number
  /** total_pages reported for the current tier; 0 until a page comes back. */
  totalPages: number
  exhausted: boolean
  inFlight: boolean
  contributed: number
  emptyStreak: number
  /** Per-page diagnostics for the current cycle. */
  lastAdded: number
  lastDropped: number
}

interface Internals {
  key: string
  movie: Source
  tv: Source
  queue: Title[]
  staging: Title[]
  seenIds: Set<string>
  /** `${type}:${tier}:${page}` for pages already fetched *successfully*. */
  requested: Set<string>
  pumping: boolean
  /** Set when a cycle stopped on the work limit with the buffer still low. */
  needsMore: boolean
  pagesThisCycle: number
}

const freshSource = (type: MediaType, resume?: Cursor): Source => ({
  type,
  tier: resume?.tier ?? 0,
  page: resume?.page ?? 0,
  totalPages: 0,
  exhausted: false,
  inFlight: false,
  contributed: 0,
  emptyStreak: 0,
  lastAdded: 0,
  lastDropped: 0,
})

function freshInternals(key: string, resume?: ProgressEntry): Internals {
  return {
    key,
    movie: freshSource('movie', resume?.movie),
    tv: freshSource('series', resume?.tv),
    queue: [],
    staging: [],
    seenIds: new Set(),
    requested: new Set(),
    pumping: false,
    needsMore: false,
    pagesThisCycle: 0,
  }
}

export interface DiscoveryDiagnostics {
  filterKey: string
  movie: { tier: number; page: number; totalPages: number; exhausted: boolean; added: number; dropped: number }
  tv: { tier: number; page: number; totalPages: number; exhausted: boolean; added: number; dropped: number }
  queue: number
  staging: number
  classified: number
  pagesThisCycle: number
  lastError: string | null
  /** Compact viewer summary, e.g. `b1995 c0.8 en,fr` — empty when uncalibrated. */
  viewer: string
}

export interface DiscoveryState {
  deck: Title[]
  loading: boolean
  error: string | null
  /** True only when every enabled source is *proven* finished. */
  exhausted: boolean
  retry: () => void
  diagnostics: DiscoveryDiagnostics
}

export function useDiscovery(
  filters: Filters,
  statuses: Record<string, { status: TitleStatus }>,
  viewer?: Viewer,
): DiscoveryState {
  const key = useMemo(() => filterKey(filters), [filters])
  const viewerSig = viewerSignature(viewer)
  /** Bumped on every in-place re-rank; see the `deck` memo. */
  const [rankRevision, setRankRevision] = useState(0)

  const ref = useRef<Internals>(freshInternals(key))
  const [, forceRender] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState(false)

  const statusesRef = useRef(statuses)
  statusesRef.current = statuses

  const abortRef = useRef<AbortController | null>(null)

  const enabled = useCallback(
    (s: Source) => filters.types.includes(s.type === 'movie' ? 'movie' : 'series'),
    [filters.types],
  )

  const flushStaging = useCallback(
    (force: boolean) => {
      const st = ref.current
      if (!st.staging.length) return
      if (!force && st.staging.length < RANK_WINDOW) return
      st.queue = st.queue.concat(withExploration(st.staging, st.queue.slice(-6), viewer))
      st.staging = []
    },
    [viewer],
  )

  const unresolvedCount = useCallback(() => {
    const s = statusesRef.current
    return ref.current.queue.filter((t) => !s[t.id]).length
  }, [])

  /** Moves a source to the next rung, or marks it genuinely finished. */
  const advanceTier = useCallback(
    (src: Source) => {
      const rungs = ladderLength(filters, src.type)
      if (src.tier + 1 >= rungs) {
        src.exhausted = true
        return
      }
      src.tier += 1
      src.page = 0
      src.totalPages = 0
      src.emptyStreak = 0
    },
    [filters],
  )

  const pump = useCallback(async () => {
    const st = ref.current
    // A cycle is already running; it will re-evaluate the buffer when it ends.
    if (st.pumping) return

    const sources = [st.movie, st.tv].filter(enabled)
    if (!sources.length) {
      setLoading(false)
      return
    }
    if (sources.every((s) => s.exhausted)) {
      flushStaging(true)
      setExhausted(unresolvedCount() === 0)
      setLoading(false)
      forceRender((n) => n + 1)
      return
    }

    st.pumping = true
    st.needsMore = false
    st.pagesThisCycle = 0
    setLoading(true)
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller
    const myKey = st.key
    let skips = 0

    try {
      while (
        unresolvedCount() + st.staging.length < TARGET &&
        st.pagesThisCycle < MAX_PAGES_PER_CYCLE &&
        !sources.every((s) => s.exhausted)
      ) {
        const open = sources.filter((s) => !s.exhausted)
        // Independent cursors: pick whichever enabled source has contributed
        // less, so one type running dry never ends the other.
        const src = open.reduce((a, b) => (a.contributed <= b.contributed ? a : b))

        const nextPage = src.page + 1

        // Past the end of this rung: step down the ladder rather than stopping.
        if (
          (src.totalPages > 0 && nextPage > src.totalPages) ||
          nextPage > catalogProvider.maxPages
        ) {
          advanceTier(src)
          continue
        }

        const reqId = `${src.type}:${src.tier}:${nextPage}`
        if (st.requested.has(reqId)) {
          src.page = nextPage
          if (++skips > MAX_SKIPS_PER_CYCLE) break
          continue
        }

        src.inFlight = true
        let res
        try {
          res = await catalogProvider.getDiscoveryTitles({
            filters,
            type: src.type,
            page: nextPage,
            tier: src.tier,
            signal: controller.signal,
          })
        } finally {
          src.inFlight = false
        }

        // Filter changed mid-flight — discard this response entirely. The
        // newer cycle owns `loading` from here on.
        if (ref.current.key !== myKey) return

        // Only successful pages are remembered, so a failed one can be retried.
        st.requested.add(reqId)
        st.pagesThisCycle++
        src.page = nextPage
        if (res.totalPages > 0) src.totalPages = res.totalPages

        const s = statusesRef.current
        let added = 0
        let dropped = 0
        for (const t of res.items) {
          if (st.seenIds.has(t.id) || s[t.id]) {
            dropped++
            continue
          }
          st.seenIds.add(t.id)
          st.staging.push(t)
          added++
        }
        src.contributed += added
        src.lastAdded = added
        src.lastDropped = dropped

        // A page of duplicates/already-classified rows is not exhaustion — keep
        // going deeper, and only give the rung up after a bounded dry run.
        if (added === 0) {
          src.emptyStreak++
          if (src.emptyStreak >= NO_PROGRESS_LIMIT) advanceTier(src)
        } else {
          src.emptyStreak = 0
        }

        if (res.exhausted) advanceTier(src)

        flushStaging(false)
        saveProgress(
          st.key,
          { tier: st.movie.tier, page: st.movie.page },
          { tier: st.tv.tier, page: st.tv.page },
        )
      }

      const allDone = sources.every((s) => s.exhausted)
      flushStaging(allDone || unresolvedCount() === 0)

      // Stopped on the work limit with the buffer still low: more work remains.
      st.needsMore =
        !allDone && unresolvedCount() + st.staging.length < TARGET

      setExhausted(allDone && unresolvedCount() === 0 && st.staging.length === 0)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      // Never exhaustion. The user gets a retry affordance instead.
      setError(describeError(err))
      setExhausted(false)
    } finally {
      if (ref.current.key === myKey) {
        st.pumping = false
        setLoading(false)
        forceRender((n) => n + 1)
      }
    }
  }, [filters, flushStaging, unresolvedCount, advanceTier, enabled])

  // Keep a reference the effects below can call without re-subscribing.
  const pumpRef = useRef(pump)
  pumpRef.current = pump

  // Reset on filter change; resume that combination's saved cursors.
  useEffect(() => {
    abortRef.current?.abort()
    ref.current = freshInternals(key, loadProgress()[key])
    setError(null)
    setExhausted(false)
    setLoading(true)
    forceRender((n) => n + 1)
    void pump()
    return () => abortRef.current?.abort()
  }, [key, pump])

  /**
   * Re-rank the buffered queue when the viewer changes.
   *
   * The alternative — invalidating the whole deck, as a viewer-aware
   * `filterKey` used to — would restart TMDB paging every few swipes now that
   * the fit is continuous. The head of the queue is preserved so the card the
   * user is currently looking at does not change under them.
   */
  const lastSig = useRef(viewerSig)
  useEffect(() => {
    if (lastSig.current === viewerSig) return
    lastSig.current = viewerSig
    const st = ref.current
    if (st.queue.length <= RERANK_KEEP) return
    const head = st.queue.slice(0, RERANK_KEEP)
    st.queue = [...head, ...withExploration(st.queue.slice(RERANK_KEEP), head, viewer)]
    setRankRevision((n) => n + 1)
  }, [viewerSig, viewer])

  const deck = useMemo(
    () => ref.current.queue.filter((t) => !statuses[t.id]),
    // `rankRevision` is essential: an in-place re-rank leaves `queue.length`
    // untouched, so without it this memo would keep serving the stale order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statuses, ref.current.queue.length, rankRevision, loading, error],
  )

  /**
   * Refill whenever the buffer is low. This intentionally does not gate on the
   * `loading` flag — `pump` already refuses to start a second concurrent cycle
   * — so a stale flag can never stall the deck. A short interval acts as a
   * backstop for the case where the queue drains without `deck.length`
   * changing identity.
   */
  const errorRef = useRef(error)
  errorRef.current = error

  useEffect(() => {
    const tick = () => {
      const st = ref.current
      if (st.pumping || errorRef.current) return
      const needed =
        st.queue.filter((t) => !statusesRef.current[t.id]).length < LOW_WATER || st.needsMore
      if (needed) void pumpRef.current()
    }
    // One long-lived timer per filter combination — no re-subscribing on every
    // swipe, which would otherwise churn timers during a fast session.
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [key])

  // Immediate top-up the moment the buffer crosses the low-water mark.
  useEffect(() => {
    if (error || loading) return
    if (deck.length < LOW_WATER || ref.current.needsMore) void pumpRef.current()
  }, [deck.length, error, loading])

  const retry = useCallback(() => {
    setError(null)
    void pump()
  }, [pump])

  const st = ref.current
  const snap = (s: Source) => ({
    tier: s.tier,
    page: s.page,
    totalPages: s.totalPages,
    exhausted: s.exhausted,
    added: s.lastAdded,
    dropped: s.lastDropped,
  })

  const diagnostics: DiscoveryDiagnostics = {
    filterKey: st.key,
    movie: snap(st.movie),
    tv: snap(st.tv),
    queue: st.queue.length,
    staging: st.staging.length,
    classified: Object.keys(statuses).length,
    pagesThisCycle: st.pagesThisCycle,
    lastError: error,
    viewer: hasSignal(viewer)
      ? `b${viewer.birthYear} c${viewer.confidence} ${viewer.markets.slice(0, 3).join(',')}`
      : '',
  }

  // Development-only inspection hook. Carries no tokens or headers.
  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__reeldexDiscovery = () => ({
      ...diagnostics,
      provider: usingTmdb ? 'tmdb' : 'local',
      deck: deck.length,
      pumping: st.pumping,
      needsMore: st.needsMore,
      // Enough of each card to check the deck's composition against the fitted
      // viewer without reaching into the DOM.
      titles: deck.map((t) => ({ y: t.year, l: t.languageCode, t: t.title })),
    })
  }

  return {
    deck,
    loading,
    error,
    // Proven exhaustion only: nothing queued, nothing staged, nothing in
    // flight, no error, and every enabled source finished its whole ladder.
    exhausted:
      exhausted &&
      deck.length === 0 &&
      !loading &&
      !error &&
      !st.pumping &&
      st.staging.length === 0 &&
      !st.needsMore,
    retry,
    diagnostics,
  }
}
