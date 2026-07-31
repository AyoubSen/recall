import type { MediaType } from '../../types'

/**
 * TMDB genre ids are stable and documented, so they are embedded rather than
 * fetched — it saves two requests on every cold start and keeps the filter UI
 * usable offline.
 *
 * TV uses a few composite genres ("Sci-Fi & Fantasy"). Those are expanded into
 * the canonical names below so a single set of genre chips works for movies and
 * series alike.
 */

export const MOVIE_GENRES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10770: 'TV Movie',
}

/** TV genre id -> one or more canonical names. */
export const TV_GENRES: Record<number, string[]> = {
  10759: ['Action', 'Adventure'],
  16: ['Animation'],
  35: ['Comedy'],
  80: ['Crime'],
  99: ['Documentary'],
  18: ['Drama'],
  10751: ['Family'],
  10762: ['Kids'],
  9648: ['Mystery'],
  10763: ['News'],
  10764: ['Reality'],
  10765: ['Science Fiction', 'Fantasy'],
  10766: ['Soap'],
  10767: ['Talk'],
  10768: ['War'],
  37: ['Western'],
}

/** Canonical genre names offered in the filter UI. */
export const CANONICAL_GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Reality',
  'Romance',
  'Science Fiction',
  'Thriller',
  'War',
  'Western',
]

const MOVIE_BY_NAME = new Map(
  Object.entries(MOVIE_GENRES).map(([id, name]) => [name, Number(id)]),
)

const TV_BY_NAME = new Map<string, number>()
for (const [id, names] of Object.entries(TV_GENRES)) {
  for (const n of names) if (!TV_BY_NAME.has(n)) TV_BY_NAME.set(n, Number(id))
}

/** TMDB genre ids for a canonical name, or [] when that type has no equivalent. */
export function genreIdsFor(names: string[], type: MediaType): number[] {
  const table = type === 'movie' ? MOVIE_BY_NAME : TV_BY_NAME
  const ids = new Set<number>()
  for (const n of names) {
    const id = table.get(n)
    if (id != null) ids.add(id)
  }
  return [...ids]
}

export function genreNames(ids: number[] | undefined, type: MediaType): string[] {
  if (!ids?.length) return []
  const out = new Set<string>()
  for (const id of ids) {
    if (type === 'movie') {
      const n = MOVIE_GENRES[id]
      if (n && n !== 'TV Movie') out.add(n)
    } else {
      for (const n of TV_GENRES[id] ?? []) out.add(n)
    }
  }
  return [...out]
}

/** UI language names -> ISO 639-1, for TMDB's with_original_language. */
export const LANGUAGES: { name: string; code: string }[] = [
  { name: 'English', code: 'en' },
  { name: 'French', code: 'fr' },
  { name: 'Spanish', code: 'es' },
  { name: 'German', code: 'de' },
  { name: 'Italian', code: 'it' },
  { name: 'Japanese', code: 'ja' },
  { name: 'Korean', code: 'ko' },
  { name: 'Mandarin', code: 'zh' },
  { name: 'Cantonese', code: 'cn' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Portuguese', code: 'pt' },
  { name: 'Swedish', code: 'sv' },
  { name: 'Danish', code: 'da' },
]

const CODE_BY_NAME = new Map(LANGUAGES.map((l) => [l.name, l.code]))
const NAME_BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l.name]))

export const languageCode = (name: string) => CODE_BY_NAME.get(name)
export const languageName = (code: string | undefined) =>
  (code && NAME_BY_CODE.get(code)) || (code ? code.toUpperCase() : 'Unknown')
