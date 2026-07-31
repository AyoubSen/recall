import type { Filters, PopularityFloor, TasteProfile, Title } from '../../types'
import { CATALOG } from '../catalog'
import { genreFrequencyOf, scoreCandidates } from './scoring'
import type { CatalogProvider, DiscoveryRequest, Page } from './types'

/**
 * The bundled 91-title demo catalogue. Used only when no TMDB token is
 * configured, or as an offline fallback — it is no longer the primary source.
 */

const POPULARITY_FLOOR: Record<PopularityFloor, number> = {
  popular: 75,
  balanced: 55,
  everything: 0,
}

export const LOCAL_PAGE_SIZE = 20

export function matchesFilters(title: Title, f: Filters): boolean {
  if (!f.types.includes(title.type)) return false
  if (title.year && (title.year < f.yearFrom || title.year > f.yearTo)) return false
  if (title.popularity < POPULARITY_FLOOR[f.popularity]) return false
  if (f.genres.length && !title.genres.some((g) => f.genres.includes(g))) return false
  if (f.languages.length && !f.languages.includes(title.language)) return false
  return true
}

const GENRE_FREQ = genreFrequencyOf(CATALOG)

export const localProvider: CatalogProvider = {
  id: 'local',
  maxPages: Math.ceil(CATALOG.length / LOCAL_PAGE_SIZE),

  async getDiscoveryTitles({ filters, type, page }: DiscoveryRequest): Promise<Page<Title>> {
    const pool = CATALOG.filter(
      (x) => x.type === type && matchesFilters(x, { ...filters, types: [type] }),
    ).sort((a, b) => b.popularity - a.popularity || a.id.localeCompare(b.id))

    const start = (page - 1) * LOCAL_PAGE_SIZE
    const items = pool.slice(start, start + LOCAL_PAGE_SIZE)
    const totalPages = Math.max(1, Math.ceil(pool.length / LOCAL_PAGE_SIZE))
    return { items, page, totalPages, exhausted: page >= totalPages }
  },

  async searchTitles(query: string, page = 1): Promise<Page<Title>> {
    const q = query.trim().toLowerCase()
    if (!q) return { items: [], page, totalPages: 1, exhausted: true }
    const hits = CATALOG.filter(
      (x) =>
        x.title.toLowerCase().includes(q) ||
        x.genres.some((g) => g.toLowerCase().includes(q)) ||
        (x.cast ?? []).some((c) => c.toLowerCase().includes(q)) ||
        (x.director ?? '').toLowerCase().includes(q),
    ).sort((a, b) => {
      const aStarts = a.title.toLowerCase().startsWith(q) ? 1 : 0
      const bStarts = b.title.toLowerCase().startsWith(q) ? 1 : 0
      return bStarts - aStarts || b.popularity - a.popularity
    })
    return { items: hits.slice(0, 30), page: 1, totalPages: 1, exhausted: true }
  },

  async getTitleDetails(id: string) {
    return CATALOG.find((x) => x.id === id)
  },

  async getRecommendations(profile: TasteProfile, exclude: Set<string>) {
    return scoreCandidates(CATALOG, profile, exclude, GENRE_FREQ, 24)
  },
}
