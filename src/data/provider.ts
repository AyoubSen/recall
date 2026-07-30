import type { Filters, PopularityFloor, TasteProfile, Title } from '../types'
import { CATALOG } from './catalog'

/**
 * Catalogue provider interface. The UI only ever talks to this, so a TMDB
 * implementation can be dropped in later without touching any component.
 */
export interface CatalogProvider {
  getDiscoveryTitles(filters: Filters, page: number): Promise<Title[]>
  searchTitles(query: string): Promise<Title[]>
  getTitleDetails(id: string): Promise<Title | undefined>
  getRecommendations(profile: TasteProfile, exclude: Set<string>): Promise<Recommendation[]>
}

export interface Recommendation {
  title: Title
  score: number
  reasons: string[]
}

const POPULARITY_FLOOR: Record<PopularityFloor, number> = {
  popular: 75,
  balanced: 55,
  everything: 0,
}

export const PAGE_SIZE = 20

/** How common each genre is across the catalogue — used to weight how
 *  distinctive a recommendation reason is. */
const CATALOG_GENRE_FREQ = new Map<string, number>()
for (const t of CATALOG) {
  for (const g of t.genres) CATALOG_GENRE_FREQ.set(g, (CATALOG_GENRE_FREQ.get(g) ?? 0) + 1)
}

export function matchesFilters(title: Title, f: Filters): boolean {
  if (!f.types.includes(title.type)) return false
  if (title.year < f.yearFrom || title.year > f.yearTo) return false
  if (title.popularity < POPULARITY_FLOOR[f.popularity]) return false
  if (f.genres.length && !title.genres.some((g) => f.genres.includes(g))) return false
  if (f.languages.length && !f.languages.includes(title.language)) return false
  return true
}

/** Stable pseudo-shuffle so the deck order is varied but reproducible. */
function seedOrder(t: Title): number {
  let h = 0
  for (let i = 0; i < t.id.length; i++) h = (h * 31 + t.id.charCodeAt(i)) | 0
  return Math.abs(h % 1000) / 1000
}

export const localProvider: CatalogProvider = {
  async getDiscoveryTitles(filters, page) {
    const pool = CATALOG.filter((x) => matchesFilters(x, filters)).sort(
      (a, b) =>
        b.popularity * 0.7 + seedOrder(b) * 40 - (a.popularity * 0.7 + seedOrder(a) * 40),
    )
    return pool.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  },

  async searchTitles(query) {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return CATALOG.filter(
      (x) =>
        x.title.toLowerCase().includes(q) ||
        x.genres.some((g) => g.toLowerCase().includes(q)) ||
        x.cast.some((c) => c.toLowerCase().includes(q)) ||
        (x.director ?? '').toLowerCase().includes(q),
    )
      .sort((a, b) => {
        const aStarts = a.title.toLowerCase().startsWith(q) ? 1 : 0
        const bStarts = b.title.toLowerCase().startsWith(q) ? 1 : 0
        return bStarts - aStarts || b.popularity - a.popularity
      })
      .slice(0, 30)
  },

  async getTitleDetails(id) {
    return CATALOG.find((x) => x.id === id)
  },

  async getRecommendations(profile, exclude) {
    const genreWeight = new Map(profile.genres.map((g) => [g.name, g.count]))
    const topGenres = profile.genres.slice(0, 3).map((g) => g.name)
    const topDecades = profile.decades.slice(0, 2).map((d) => d.decade)
    const favouritePeople = new Set(profile.people.slice(0, 5).map((p) => p.name))

    const out: Recommendation[] = []
    for (const title of CATALOG) {
      if (exclude.has(title.id)) continue

      let score = 0
      const reasons: string[] = []

      const genreHits = title.genres.filter((g) => genreWeight.has(g))
      if (genreHits.length) {
        score += genreHits.reduce((s, g) => s + (genreWeight.get(g) ?? 0), 0) * 3
        // Prefer the most *distinctive* shared genre, not simply the most
        // common one — otherwise every row reads "because you watch drama".
        const lead = [...genreHits]
          .filter((g) => topGenres.includes(g))
          .sort(
            (a, b) =>
              (genreWeight.get(b) ?? 0) / (CATALOG_GENRE_FREQ.get(b) ?? 1) -
              (genreWeight.get(a) ?? 0) / (CATALOG_GENRE_FREQ.get(a) ?? 1),
          )[0]
        if (lead) reasons.push(`Because you watch a lot of ${lead.toLowerCase()}`)
        else reasons.push('Similar to titles in your watched library')
      }

      const decade = `${Math.floor(title.year / 10) * 10}s`
      if (topDecades.includes(decade)) {
        score += 6
        reasons.push(`From one of your favourite decades — the ${decade}`)
      }

      const person = [title.director, ...title.cast].find(
        (p): p is string => !!p && favouritePeople.has(p),
      )
      if (person) {
        score += 8
        reasons.push(`You have watched more with ${person}`)
      }

      if (profile.averageRating > 0 && title.rating >= profile.averageRating) {
        score += 4
        reasons.push('Rated higher than your average watch')
      }

      score += title.popularity * 0.05
      if (score <= 0) continue

      out.push({ title, score, reasons: reasons.slice(0, 2) })
    }

    return out.sort((a, b) => b.score - a.score).slice(0, 24)
  },
}
