export type MediaType = 'movie' | 'series'

export type TitleStatus = 'unresolved' | 'watched' | 'not_watched' | 'watchlist' | 'unsure'

/** A catalogue entry. Shaped so a TMDB response can be mapped onto it 1:1 later. */
export interface Title {
  id: string
  type: MediaType
  title: string
  year: number
  genres: string[]
  overview: string
  /** minutes, movies only */
  runtime?: number
  /** series only */
  seasons?: number
  /** 0-10 */
  rating: number
  /** 0-100, used by the "minimum popularity" filter */
  popularity: number
  language: string
  director?: string
  cast: string[]
  /** Remote poster. Left empty in the mock catalogue -> generated poster is used. */
  posterUrl?: string
  /** Two hex colours driving the generated poster/backdrop fallback. */
  palette: [string, string]
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
}
