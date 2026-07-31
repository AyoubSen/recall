import type { MediaType, Title } from '../../types'
import { backdropUrl, posterUrl } from './client'
import { genreNames, languageName } from './genres'

/** Minimal shape of a TMDB discovery/search row. Everything is optional. */
export interface TmdbRow {
  id: number
  media_type?: string
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  release_date?: string
  first_air_date?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  genre_ids?: number[]
  genres?: { id: number; name: string }[]
  original_language?: string
  popularity?: number
  vote_average?: number
  vote_count?: number
  adult?: boolean
}

export const compoundId = (type: MediaType, tmdbId: number) =>
  `tmdb:${type === 'movie' ? 'movie' : 'tv'}:${tmdbId}`

/** Parses a compound id back into its parts, or null for non-TMDB ids. */
export function parseId(id: string): { type: MediaType; tmdbId: number } | null {
  const m = /^tmdb:(movie|tv):(\d+)$/.exec(id)
  if (!m) return null
  return { type: m[1] === 'movie' ? 'movie' : 'series', tmdbId: Number(m[2]) }
}

/**
 * TMDB popularity is an unbounded, spiky number (roughly 0 to several
 * thousand). Compress it into the 0-100 reach scale the ranking already uses:
 * log scaling keeps ordering while stopping one viral title from dominating.
 */
export function normalizePopularity(raw: number | undefined, voteCount: number | undefined): number {
  const p = Math.max(0, raw ?? 0)
  const byPopularity = (Math.log10(p + 1) / Math.log10(1001)) * 100
  const v = Math.max(0, voteCount ?? 0)
  const byVotes = (Math.log10(v + 1) / Math.log10(20001)) * 100
  // Vote count is the better proxy for "lots of people have seen this".
  return Math.round(Math.min(100, byPopularity * 0.4 + byVotes * 0.6))
}

const yearOf = (date: string | undefined) => {
  const y = date ? Number(date.slice(0, 4)) : 0
  return Number.isFinite(y) ? y : 0
}

export function normalizeRow(row: TmdbRow, forced?: MediaType): Title | null {
  const type: MediaType =
    forced ?? (row.media_type === 'tv' ? 'series' : row.media_type === 'movie' ? 'movie' : row.title ? 'movie' : 'series')

  if (row.adult) return null
  const name = (type === 'movie' ? row.title : row.name)?.trim()
  if (!name || !row.id) return null

  const ids = row.genre_ids ?? row.genres?.map((g) => g.id)
  const voteCount = row.vote_count ?? 0

  return {
    id: compoundId(type, row.id),
    source: 'tmdb',
    tmdbId: row.id,
    type,
    title: name,
    originalTitle: (type === 'movie' ? row.original_title : row.original_name) || undefined,
    year: yearOf(type === 'movie' ? row.release_date : row.first_air_date),
    genres: genreNames(ids, type),
    overview: row.overview?.trim() || 'No overview available for this title yet.',
    posterUrl: posterUrl(row.poster_path),
    backdropUrl: backdropUrl(row.backdrop_path),
    language: languageName(row.original_language),
    languageCode: row.original_language,
    rating: row.vote_average ?? 0,
    voteCount,
    tmdbPopularity: row.popularity,
    popularity: normalizePopularity(row.popularity, voteCount),
  }
}

export function normalizeRows(rows: TmdbRow[] | undefined, forced?: MediaType): Title[] {
  const out: Title[] = []
  for (const r of rows ?? []) {
    const t = normalizeRow(r, forced)
    if (t) out.push(t)
  }
  return out
}

/* ------------------------------------------------------------------ details */

interface TmdbDetails extends TmdbRow {
  runtime?: number
  number_of_seasons?: number
  belongs_to_collection?: { id: number; name: string } | null
  created_by?: { name: string }[]
  credits?: {
    cast?: { name: string }[]
    crew?: { name: string; job: string }[]
  }
}

/** Merges a details response onto an already-normalized title. */
export function mergeDetails(base: Title, details: TmdbDetails): Title {
  const crew = details.credits?.crew ?? []
  const director =
    base.type === 'movie'
      ? crew.find((c) => c.job === 'Director')?.name
      : details.created_by?.[0]?.name

  return {
    ...base,
    genres: details.genres?.length ? genreNames(details.genres.map((g) => g.id), base.type) : base.genres,
    overview: details.overview?.trim() || base.overview,
    runtime: base.type === 'movie' ? (details.runtime || undefined) : undefined,
    seasons: base.type === 'series' ? (details.number_of_seasons || undefined) : undefined,
    director: director || base.director,
    cast: (details.credits?.cast ?? []).slice(0, 4).map((c) => c.name),
    franchise: details.belongs_to_collection?.name ?? base.franchise,
    detailed: true,
  }
}
