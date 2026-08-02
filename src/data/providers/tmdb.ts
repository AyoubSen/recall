import type { Filters, MediaType, PopularityFloor, TasteProfile, Title } from '../../types'
import { tmdbGet } from '../tmdb/client'
import { genreIdsFor, languageCode } from '../tmdb/genres'
import { mergeDetails, normalizeRows, parseId, type TmdbRow } from '../tmdb/normalize'
import { genreFrequencyOf, scoreCandidates } from './scoring'
import type { CatalogProvider, DiscoveryRequest, Page } from './types'

interface TmdbListResponse {
  page: number
  results: TmdbRow[]
  total_pages: number
  total_results: number
}

/**
 * TMDB refuses `page` beyond 500. Each page is 20 rows, so a single filter
 * combination can surface up to ~10,000 titles per media type — far past the
 * point where a person stops swiping.
 */
const MAX_PAGES = 500

/** Watched titles used to seed For You. One sequential request each. */
const REC_SEEDS = 6

/**
 * Vote-count floors per popularity mode, as an ordered ladder.
 *
 * Each rung is a *complete* discover query with its own `total_pages`. Running
 * out of pages on one rung means that rung is finished, not that the catalogue
 * is — the deck drops to the next rung and keeps going. Mainstream titles come
 * first, then progressively broader ones.
 */
export function voteLadder(mode: PopularityFloor, type: MediaType): number[] {
  const tv = type === 'series'
  if (mode === 'popular') return tv ? [400, 150, 40] : [1000, 400, 100]
  if (mode === 'balanced') return tv ? [300, 80, 20, 0] : [800, 200, 50, 0]
  return [0]
}

function discoveryParams(filters: Filters, type: MediaType, page: number, tier: number) {
  const movie = type === 'movie'
  const params: Record<string, string | number | boolean | undefined> = {
    include_adult: false,
    language: 'en-US',
    page,
    sort_by: 'popularity.desc',
    'vote_count.gte': voteLadder(filters.popularity, type)[tier] ?? 0,
  }

  if (movie) {
    params.include_video = false
    params['primary_release_date.gte'] = `${filters.yearFrom}-01-01`
    params['primary_release_date.lte'] = `${filters.yearTo}-12-31`
  } else {
    params['first_air_date.gte'] = `${filters.yearFrom}-01-01`
    params['first_air_date.lte'] = `${filters.yearTo}-12-31`
  }

  if (filters.genres.length) {
    const ids = genreIdsFor(filters.genres, type)
    // No equivalent genre for this media type — signalled to the caller.
    if (!ids.length) return null
    params.with_genres = ids.join('|')
  }

  if (filters.languages.length) {
    const codes = filters.languages.map(languageCode).filter(Boolean)
    if (codes.length) params.with_original_language = codes.join('|')
  }

  return params
}

/** In-memory details cache — avoids refetching when a card is revisited. */
const detailsCache = new Map<string, Title>()

export const tmdbProvider: CatalogProvider = {
  id: 'tmdb',
  maxPages: MAX_PAGES,

  async getDiscoveryTitles({ filters, type, page, tier = 0, signal }: DiscoveryRequest): Promise<Page<Title>> {
    const params = discoveryParams(filters, type, page, tier)
    if (!params) return { items: [], page, totalPages: 0, exhausted: true }

    const data = await tmdbGet<TmdbListResponse>(
      type === 'movie' ? '/discover/movie' : '/discover/tv',
      params,
      { signal },
    )

    const totalPages = Math.min(data.total_pages ?? 0, MAX_PAGES)
    return {
      items: normalizeRows(data.results, type),
      page,
      totalPages,
      // Tier-level only: this rung of the ladder has no further pages. The
      // caller decides whether the catalogue itself is finished.
      exhausted: totalPages > 0 && page >= totalPages,
    }
  },

  async searchTitles(query: string, page = 1, signal?: AbortSignal): Promise<Page<Title>> {
    const q = query.trim()
    if (!q) return { items: [], page, totalPages: 1, exhausted: true }

    const data = await tmdbGet<TmdbListResponse>(
      '/search/multi',
      { query: q, include_adult: false, language: 'en-US', page },
      { signal },
    )

    // Multi-search returns people too; only movies and series are supported.
    const rows = (data.results ?? []).filter(
      (r) => r.media_type === 'movie' || r.media_type === 'tv',
    )

    const items: Title[] = []
    const seen = new Set<string>()
    for (const t of normalizeRows(rows)) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      items.push(t)
    }

    const totalPages = Math.min(data.total_pages ?? 1, MAX_PAGES)
    return { items, page, totalPages, exhausted: page >= totalPages }
  },

  async getTitleDetails(id: string, signal?: AbortSignal): Promise<Title | undefined> {
    const cached = detailsCache.get(id)
    if (cached) return cached

    const parsed = parseId(id)
    if (!parsed) return undefined

    const path = parsed.type === 'movie' ? `/movie/${parsed.tmdbId}` : `/tv/${parsed.tmdbId}`
    const data = await tmdbGet<TmdbRow & Record<string, unknown>>(
      path,
      { language: 'en-US', append_to_response: 'credits' },
      { signal },
    )

    const base = normalizeRows([data], parsed.type)[0]
    if (!base) return undefined
    const merged = mergeDetails(base, data as never)

    if (detailsCache.size > 300) detailsCache.clear()
    detailsCache.set(id, merged)
    return merged
  },

  async getRecommendations(
    profile: TasteProfile,
    exclude: Set<string>,
    known: Title[],
    signal?: AbortSignal,
  ) {
    // Seeding is capped at a handful of requests, so which titles get to be
    // seeds decides the whole page. Taking the most recent watches alone made a
    // single mark able to hijack it — mark one children's film and every row
    // becomes a children's film. Half the slots stay recent, so a new watch is
    // reflected straight away; the rest are spread evenly across the library, so
    // the page keeps reading like the whole of what the viewer has seen.
    const ids = profile.watchedIds
    const recent = ids.slice(0, Math.ceil(REC_SEEDS / 2))
    const rest = ids.slice(recent.length)
    const wanted = REC_SEEDS - recent.length
    const step = wanted > 0 ? Math.max(1, Math.floor(rest.length / wanted)) : 1
    const spread: string[] = []
    for (let i = 0; i < rest.length && spread.length < wanted; i += step) spread.push(rest[i])

    const seeds = [...recent, ...spread].map(parseId).filter(Boolean) as {
      type: MediaType
      tmdbId: number
    }[]

    const candidates: Title[] = []
    for (const seed of seeds) {
      try {
        const path =
          seed.type === 'movie'
            ? `/movie/${seed.tmdbId}/recommendations`
            : `/tv/${seed.tmdbId}/recommendations`
        const data = await tmdbGet<TmdbListResponse>(path, { language: 'en-US', page: 1 }, { signal })
        candidates.push(...normalizeRows(data.results, seed.type))
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') throw err
        // One failed seed should not empty the whole page.
      }
    }

    const freq = genreFrequencyOf(known.length ? known : candidates)
    return scoreCandidates(candidates, profile, exclude, freq, 30)
  },
}
