export type MediaType = 'movie' | 'series'

export type TitleStatus = 'unresolved' | 'watched' | 'not_watched' | 'watchlist' | 'unsure'

/** Where a title record came from. Legacy = pre-TMDB local id kept after migration. */
export type TitleSource = 'tmdb' | 'local' | 'legacy'

/**
 * The shared title model. Every provider normalizes into this shape, so no
 * TMDB-specific response field reaches a component.
 *
 * `id` is a stable compound id — `tmdb:movie:123` / `tmdb:tv:123` — so a movie
 * and a series sharing a numeric TMDB id can never collide.
 */
export interface Title {
  id: string
  source: TitleSource
  /** Numeric TMDB id, when the record came from TMDB. */
  tmdbId?: number
  type: MediaType
  title: string
  originalTitle?: string
  /** 0 when TMDB has no release/air date yet. */
  year: number
  genres: string[]
  overview: string
  posterUrl?: string
  backdropUrl?: string
  language: string
  /** ISO 639-1, kept for filtering and de-duplication. */
  languageCode?: string
  /** 0-10 */
  rating: number
  voteCount?: number
  /** Normalized 0-100 reach score. */
  popularity: number
  /** Raw TMDB popularity, used by recognition scoring. */
  tmdbPopularity?: number

  // ---- lazily filled from a details request -----------------------------
  /** minutes, movies only */
  runtime?: number
  /** series only */
  seasons?: number
  director?: string
  cast?: string[]
  /** TMDB collection name, used for franchise ordering when present. */
  franchise?: string
  franchiseOrder?: number
  /** True once details have been merged in. */
  detailed?: boolean
}

export type PopularityFloor = 'popular' | 'balanced' | 'everything'

export interface Filters {
  types: MediaType[]
  yearFrom: number
  yearTo: number
  genres: string[]
  languages: string[]
  popularity: PopularityFloor
}

export interface SwipeRecord {
  titleId: string
  status: TitleStatus
  previousStatus: TitleStatus
  at: number
}

export interface DisplayPrefs {
  libraryView: 'grid' | 'list'
  librarySort: SortKey
  showNotWatched: boolean
}

export type SortKey = 'recent' | 'year' | 'title' | 'rating'

export interface TasteProfile {
  moviesWatched: number
  seriesWatched: number
  genres: { name: string; count: number }[]
  decades: { decade: string; count: number }[]
  people: { name: string; count: number; role: 'director' | 'actor' }[]
  averageRating: number
  totalRuntimeMinutes: number
  /** Ids of watched titles, newest first — seeds remote recommendations. */
  watchedIds: string[]
}
