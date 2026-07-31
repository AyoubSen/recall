import type { Filters, MediaType, TasteProfile, Title } from '../../types'

export interface Page<T> {
  items: T[]
  page: number
  totalPages: number
  /** True when this specific query (type + tier) has no further pages. Not a
   *  statement about the catalogue as a whole. */
  exhausted: boolean
}

export interface Recommendation {
  title: Title
  score: number
  reasons: string[]
}

export interface DiscoveryRequest {
  filters: Filters
  /** Which source to pull from — the deck balances the two itself. */
  type: MediaType
  page: number
  /** Index into the provider's vote-count ladder. Each tier is its own query
   *  with its own total_pages. */
  tier?: number
  signal?: AbortSignal
}

/**
 * The only surface the app uses to reach a catalogue. Both the TMDB provider
 * and the bundled demo provider implement it, so screens never branch on which
 * one is active.
 */
export interface CatalogProvider {
  readonly id: 'tmdb' | 'local'
  /** How many discovery pages may be walked before a source is exhausted. */
  readonly maxPages: number

  getDiscoveryTitles(req: DiscoveryRequest): Promise<Page<Title>>
  searchTitles(query: string, page?: number, signal?: AbortSignal): Promise<Page<Title>>
  getTitleDetails(id: string, signal?: AbortSignal): Promise<Title | undefined>
  getRecommendations(
    profile: TasteProfile,
    exclude: Set<string>,
    known: Title[],
    signal?: AbortSignal,
  ): Promise<Recommendation[]>
}
