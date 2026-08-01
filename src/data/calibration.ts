import type { Title } from '../types'
import { CATALOG } from './catalog'
import { ICONIC } from './deckMeta'
import { usingTmdb } from './provider'
import { tmdbGet } from './tmdb/client'
import { normalizeRows, type TmdbRow } from './tmdb/normalize'

/**
 * Probe selection for the calibration round.
 *
 * The round fits a viewer, so the probes exist to *spread* the answers across
 * the two axes being fitted — era and market — not to be interesting.
 *
 * The governing rule: a probe must be near-universally seen **within its own
 * cell**. Then a "no" is evidence the viewer is distant from that cell, rather
 * than evidence about their taste. That is why every probe is the single
 * highest-vote-count title in its bucket instead of a critical pick.
 */

/** One probe per decade. Ordered oldest first; the UI shuffles for display. */
const DECADES: [number, number][] = [
  [1970, 1979],
  [1980, 1989],
  [1990, 1999],
  [2000, 2009],
  [2010, 2019],
  [2020, 2026],
]

/**
 * Non-English markets worth probing. These are chosen for having at least one
 * title with genuinely global reach, so a "no" is informative rather than just
 * a reflection of the title being obscure everywhere.
 */
const MARKET_PROBES = ['fr', 'es', 'ja', 'ko', 'hi']
const MAX_MARKET_PROBES = 4
/** How far past a language's global crossover hits to reach. See `votedMovie`. */
const MARKET_PROBE_RANK = 7

/** v1 cached global crossover hits as market probes; see `votedMovie`. */
const CACHE_KEY = 'recall.calibration.v2'
/** Probes describe the shape of film history; they do not need to be fresh. */
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30

interface TmdbListResponse {
  results: TmdbRow[]
}

/** The viewer's own language, so their market is always among the probes. */
function localeLanguage(): string | undefined {
  try {
    const code = (navigator.languages?.[0] ?? navigator.language)?.split('-')[0]?.toLowerCase()
    return code && code.length === 2 && code !== 'en' ? code : undefined
  } catch {
    return undefined
  }
}

function marketsToProbe(): string[] {
  const locale = localeLanguage()
  const rest = MARKET_PROBES.filter((m) => m !== locale)
  const wanted = locale ? [locale, ...rest] : rest
  return wanted.slice(0, MAX_MARKET_PROBES)
}

/* -------------------------------------------------------------------- tmdb */

/**
 * `rank` selects how far down the vote-count ordering to reach.
 *
 * Era probes want rank 0 — the single most-voted film of the decade is the best
 * possible "were you around for this?" test.
 *
 * Market probes deliberately do *not*. The most-voted film in a language is
 * always its global crossover hit (Parasite, Spirited Away, Intouchables), and
 * those are watched just as much by people outside the market as inside it — so
 * a "yes" says nothing about market exposure. Reaching past them finds titles
 * that are still huge domestically but far less exported, which is what makes a
 * "yes" informative.
 */
async function votedMovie(
  params: Record<string, string | number | boolean>,
  rank: number,
  signal?: AbortSignal,
): Promise<Title | undefined> {
  const data = await tmdbGet<TmdbListResponse>(
    '/discover/movie',
    {
      include_adult: false,
      include_video: false,
      language: 'en-US',
      page: 1,
      sort_by: 'vote_count.desc',
      ...params,
    },
    { signal },
  )
  const rows = normalizeRows(data.results ?? [], 'movie')
  return rows[rank] ?? rows[0]
}

async function tmdbProbes(signal?: AbortSignal): Promise<Title[]> {
  const out: Title[] = []
  const seen = new Set<string>()

  const push = (t: Title | undefined) => {
    if (!t || seen.has(t.id) || !t.posterUrl) return
    seen.add(t.id)
    out.push(t)
  }

  // Era probes: the most-voted film of each decade.
  for (const [from, to] of DECADES) {
    push(
      await votedMovie(
        {
          'primary_release_date.gte': `${from}-01-01`,
          'primary_release_date.lte': `${to}-12-31`,
          with_original_language: 'en',
        },
        0,
        signal,
      ),
    )
  }

  // Market probes: domestically huge, deliberately past the global crossovers.
  for (const lang of marketsToProbe()) {
    push(await votedMovie({ with_original_language: lang }, MARKET_PROBE_RANK, signal))
  }

  return out
}

/* ------------------------------------------------------------------- local */

/** Demo-catalogue equivalent, using the curated recognisability set. */
function localProbes(): Title[] {
  const out: Title[] = []
  const seen = new Set<string>()

  const bestIn = (pool: Title[]) =>
    [...pool].sort(
      (a, b) =>
        Number(ICONIC.has(b.id)) - Number(ICONIC.has(a.id)) ||
        b.popularity - a.popularity ||
        a.id.localeCompare(b.id),
    )[0]

  for (const [from, to] of DECADES) {
    const pick = bestIn(
      CATALOG.filter(
        (t) => t.year >= from && t.year <= to && (t.languageCode ?? 'en') === 'en',
      ),
    )
    if (pick && !seen.has(pick.id)) {
      seen.add(pick.id)
      out.push(pick)
    }
  }

  for (const lang of marketsToProbe()) {
    const pick = bestIn(CATALOG.filter((t) => t.languageCode === lang))
    if (pick && !seen.has(pick.id)) {
      seen.add(pick.id)
      out.push(pick)
    }
  }

  return out
}

/* ------------------------------------------------------------------- cache */

function readCache(): Title[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
    if (!raw || !Array.isArray(raw.probes) || typeof raw.at !== 'number') return null
    if (Date.now() - raw.at > CACHE_TTL_MS) return null
    return raw.probes as Title[]
  } catch {
    return null
  }
}

export function clearCalibrationCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* nothing depends on the cache being gone */
  }
}

function writeCache(probes: Title[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), probes }))
  } catch {
    /* the probe set is re-derivable; a failed cache is not worth surfacing */
  }
}

/**
 * The probe set for a calibration round.
 *
 * Falls back to the bundled catalogue whenever TMDB is unavailable or returns
 * too little to fit anything — a failed calibration must never block onboarding.
 */
export async function getCalibrationProbes(signal?: AbortSignal): Promise<Title[]> {
  const cached = readCache()
  if (cached?.length) return cached

  if (usingTmdb) {
    try {
      const probes = await tmdbProbes(signal)
      if (probes.length >= 6) {
        writeCache(probes)
        return probes
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err
      // Fall through to the local set.
    }
  }

  return localProbes()
}
