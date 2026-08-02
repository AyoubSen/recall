import type { Title, Viewer } from '../types'
import { FRANCHISE, ICONIC } from './deckMeta'
import { eraAffinity, fameOf, hasSignal, marketAffinity } from './viewer'

/**
 * Recognition-first deck ordering.
 *
 * The deck exists to help someone rebuild a viewing history, so ordering
 * optimises for "do I recognise this?" rather than one popularity number.
 * Two deterministic stages:
 *
 *   1. score each title for recognisability
 *   2. greedily interleave a candidate window, penalising anything that
 *      repeats the recent run (genre, decade, type, language, director,
 *      franchise)
 *
 * With a remote catalogue the window is assembled from several fetched pages
 * before being ranked, so ordering is not decided one tiny API page at a time.
 * Given the same filters, fetched pages and statuses the result is identical.
 */

const CURRENT_YEAR = 2026

/**
 * 0-100. Higher = more likely *this* viewer recognises it instantly.
 *
 * Without a `viewer` the result is the global fame prior, unchanged — which is
 * what the demo catalogue and an uncalibrated user get. With one, two
 * viewer-relative terms are blended in, both scaled by the fit's confidence so
 * a weak calibration can only nudge the ordering, never dominate it.
 */
export function recognitionScore(t: Title, viewer?: Viewer): number {
  let score = t.popularity * 0.62

  // How many people bothered to rate it is the strongest single signal of
  // reach that TMDB exposes.
  const votes = t.voteCount ?? 0
  if (votes) score += Math.min(22, (Math.log10(votes + 1) / Math.log10(20001)) * 22)

  // Acclaim helps recognition, but far less than reach.
  if (t.rating) score += (t.rating - 7) * 4

  // Curated boost for the demo catalogue; harmless when absent.
  if (ICONIC.has(t.id)) score += 12

  // Both ends of the age range are recognisable to different crowds, so the
  // deck spans eras instead of clustering on one.
  //
  // Note there is no bonus for being *new*. Recency is a reach signal for a
  // recommender, but this deck asks what you have already seen, and a title
  // released this year — or not yet released — is close to a guaranteed "no".
  // Promoting those spends deck slots on the one answer we can predict.
  if (t.year) {
    const age = CURRENT_YEAR - t.year
    if (age < 1) score -= 10
    else if (age >= 30 && t.popularity >= 55) score += 3
  } else {
    // Unreleased or dateless entries are rarely recognisable.
    score -= 15
  }

  if (hasSignal(viewer)) {
    // Did this land inside the viewer's own watching life? Fame is passed in so
    // the pre-birth penalty spares the canon.
    score += eraAffinity(t.year, viewer.birthYear, fameOf(t)) * viewer.confidence
    // Language exposure relative to this viewer, not to English.
    const code = t.languageCode ?? (t.language === 'English' ? 'en' : undefined)
    score += marketAffinity(code, viewer.markets) * viewer.confidence
  } else {
    // No fit to work from: non-English titles are recognised less widely at
    // equal popularity, on average across everyone.
    if (t.languageCode ? t.languageCode !== 'en' : t.language !== 'English') score -= 6
  }

  // Nothing to show and nothing to recognise.
  if (!t.posterUrl) score -= 12

  return Math.max(0, Math.min(100, score))
}

// Development-only inspection hook; see the matching one in viewer.ts.
if (import.meta.env.DEV) {
  ;(globalThis as unknown as Record<string, unknown>).__reeldexRanking = {
    recognitionScore,
    rankDeck: (titles: Title[], seed: Title[], viewer?: Viewer) => rankDeck(titles, seed, viewer),
  }
}

const decadeOf = (t: Title) => (t.year ? Math.floor(t.year / 10) * 10 : 0)

interface RecentRun {
  genres: string[][]
  decades: number[]
  types: string[]
  languages: (string | undefined)[]
  directors: (string | undefined)[]
  franchises: (string | undefined)[]
  scores: number[]
}

const emptyRun = (): RecentRun => ({
  genres: [],
  decades: [],
  types: [],
  languages: [],
  directors: [],
  franchises: [],
  scores: [],
})

const franchiseOf = (t: Title) => t.franchise ?? FRANCHISE[t.id]?.franchise
const franchiseOrderOf = (t: Title) => t.franchiseOrder ?? FRANCHISE[t.id]?.order

/** Penalty for placing `t` next, given what was just placed. */
function diversityPenalty(t: Title, run: RecentRun, viewer?: Viewer): number {
  let penalty = 0

  const recentGenres = run.genres.slice(-3).flat()
  penalty += t.genres.filter((g) => recentGenres.includes(g)).length * 9

  const d = decadeOf(t)
  if (d) penalty += run.decades.slice(-3).filter((x) => x === d).length * 10

  const lastTwo = run.types.slice(-2)
  if (lastTwo.length >= 1 && lastTwo[lastTwo.length - 1] === t.type) penalty += 7
  if (lastTwo.length === 2 && lastTwo.every((x) => x === t.type)) penalty += 34

  // Avoid clusters of the same non-English language.
  const lang = t.languageCode
  if (lang && lang !== 'en' && run.languages.slice(-3).includes(lang)) penalty += 14

  // Optional metadata: only penalises when present, never blocks.
  if (t.director && run.directors.slice(-5).includes(t.director)) penalty += 22

  const fr = franchiseOf(t)
  if (fr && run.franchises.slice(-6).includes(fr)) penalty += 30

  const lastScores = run.scores.slice(-2)
  if (lastScores.length === 2 && lastScores.every((s) => s < 55)) {
    penalty += Math.max(0, 60 - recognitionScore(t, viewer)) * 0.8
  }

  return penalty
}

/**
 * Order a candidate window for the deck.
 *
 * `seed` is the tail of what has already been queued, so a newly ranked batch
 * does not repeat whatever the user just saw.
 */
export function rankDeck(
  titles: Title[],
  seed: Title[] = [],
  viewer?: Viewer,
  lookahead = 14,
): Title[] {
  // A series is one card. Guard against a provider emitting per-season rows.
  const seen = new Set<string>()
  const pool = titles
    .filter((t) => {
      const key = `${t.type}:${(t.originalTitle ?? t.title).toLowerCase()}:${t.year}`
      if (seen.has(key) || seen.has(t.id)) return false
      seen.add(key)
      seen.add(t.id)
      return true
    })
    .map((t) => ({ t, score: recognitionScore(t, viewer) }))
    .sort((a, b) => b.score - a.score || a.t.id.localeCompare(b.t.id))

  const run = emptyRun()
  for (const s of seed.slice(-6)) {
    run.genres.push(s.genres)
    run.decades.push(decadeOf(s))
    run.types.push(s.type)
    run.languages.push(s.languageCode)
    run.directors.push(s.director)
    run.franchises.push(franchiseOf(s))
    run.scores.push(recognitionScore(s, viewer))
  }

  const placed = new Set<string>()
  const out: Title[] = []

  /** True when an earlier entry of the same franchise is still unplaced. */
  const blockedByFranchise = (t: Title) => {
    const fr = franchiseOf(t)
    const order = franchiseOrderOf(t)
    if (!fr || order == null) return false
    return pool.some(
      ({ t: other }) =>
        other.id !== t.id &&
        !placed.has(other.id) &&
        franchiseOf(other) === fr &&
        (franchiseOrderOf(other) ?? Infinity) < order,
    )
  }

  while (out.length < pool.length) {
    const candidates = pool.filter((c) => !placed.has(c.t.id)).slice(0, lookahead)
    if (!candidates.length) break

    let best = candidates[0]
    let bestValue = -Infinity

    for (const [i, c] of candidates.entries()) {
      if (blockedByFranchise(c.t) && candidates.length > 1) continue
      const value = c.score - diversityPenalty(c.t, run, viewer) - i * 2.5
      if (value > bestValue) {
        bestValue = value
        best = c
      }
    }

    placed.add(best.t.id)
    out.push(best.t)
    run.genres.push(best.t.genres)
    run.decades.push(decadeOf(best.t))
    run.types.push(best.t.type)
    run.languages.push(best.t.languageCode)
    run.directors.push(best.t.director)
    run.franchises.push(franchiseOf(best.t))
    run.scores.push(best.score)
  }

  return out
}
