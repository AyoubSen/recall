import type { Title } from '../types'
import { FRANCHISE, ICONIC } from './deckMeta'

/**
 * Recognition-first deck ordering.
 *
 * The deck exists to help someone rebuild a viewing history, so the ordering
 * optimises for "do I recognise this?" rather than for a single popularity
 * number. Two stages, both fully deterministic:
 *
 *   1. score each title for recognisability
 *   2. greedily interleave the ranked pool, penalising anything that repeats
 *      the recent run (genre, decade, type, director, franchise)
 *
 * Deterministic means the same catalogue + filters always yields the same deck,
 * which keeps sessions resumable and makes the behaviour testable.
 */

const CURRENT_YEAR = 2026

/** 0-100. Higher = more likely the average viewer recognises it instantly. */
export function recognitionScore(t: Title): number {
  let score = t.popularity * 0.72

  // Acclaim helps recognition, but far less than reach.
  score += (t.rating - 7) * 6

  // Iconic titles punch above their popularity number.
  if (ICONIC.has(t.id)) score += 14

  // Very recent titles are recognisable to a different crowd than old classics;
  // both ends get a small lift so the deck spans eras instead of clustering.
  const age = CURRENT_YEAR - t.year
  if (age <= 6) score += 4
  else if (age >= 30 && t.popularity >= 60) score += 3

  // Non-English titles are recognised less widely at equal popularity.
  if (t.language !== 'English') score -= 6

  return Math.max(0, Math.min(100, score))
}

const decadeOf = (t: Title) => Math.floor(t.year / 10) * 10

interface RecentRun {
  genres: string[][]
  decades: number[]
  types: string[]
  directors: (string | undefined)[]
  franchises: (string | undefined)[]
  scores: number[]
}

/** Penalty for placing `t` next, given what was just placed. */
function diversityPenalty(t: Title, run: RecentRun): number {
  let penalty = 0

  // Same primary genre in the last 3 placements.
  const recentGenres = run.genres.slice(-3).flat()
  const shared = t.genres.filter((g) => recentGenres.includes(g)).length
  penalty += shared * 9

  // Same decade in the last 3.
  const d = decadeOf(t)
  penalty += run.decades.slice(-3).filter((x) => x === d).length * 10

  // Keep movies and series interleaved: a mild nudge after one of the same
  // type, a hard penalty after two, so runs of three-plus are a last resort.
  const lastTwo = run.types.slice(-2)
  if (lastTwo.length >= 1 && lastTwo[lastTwo.length - 1] === t.type) penalty += 7
  if (lastTwo.length === 2 && lastTwo.every((x) => x === t.type)) penalty += 34

  // Same director inside the last 5.
  if (t.director && run.directors.slice(-5).includes(t.director)) penalty += 22

  // Same franchise inside the last 6.
  const fr = FRANCHISE[t.id]?.franchise
  if (fr && run.franchises.slice(-6).includes(fr)) penalty += 30

  // Avoid long runs of obscure titles: if the last two were low-recognition,
  // strongly prefer something recognisable next.
  const lastScores = run.scores.slice(-2)
  if (lastScores.length === 2 && lastScores.every((s) => s < 55)) {
    penalty += Math.max(0, 60 - recognitionScore(t)) * 0.8
  }

  return penalty
}

/**
 * Order a filtered set of titles for the deck.
 *
 * `lookahead` bounds how far down the recognition ranking the interleaver may
 * reach to satisfy diversity, which is what keeps the deck recognition-first
 * rather than merely varied.
 */
export function rankDeck(titles: Title[], lookahead = 14): Title[] {
  // A series is one title in the deck; guard against a provider ever emitting
  // per-season rows for the same show.
  const seen = new Set<string>()
  const pool = titles
    .filter((t) => {
      const key = `${t.type}:${t.title.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((t) => ({ t, score: recognitionScore(t) }))
    .sort((a, b) => b.score - a.score || a.t.id.localeCompare(b.t.id))

  const placed = new Set<string>()
  const out: Title[] = []
  const run: RecentRun = {
    genres: [],
    decades: [],
    types: [],
    directors: [],
    franchises: [],
    scores: [],
  }

  /** True when an earlier entry of the same franchise is still unplaced. */
  const blockedByFranchise = (t: Title) => {
    const meta = FRANCHISE[t.id]
    if (!meta) return false
    return pool.some(
      ({ t: other }) =>
        other.id !== t.id &&
        !placed.has(other.id) &&
        FRANCHISE[other.id]?.franchise === meta.franchise &&
        (FRANCHISE[other.id]?.order ?? 0) < meta.order,
    )
  }

  while (out.length < pool.length) {
    const candidates = pool.filter((c) => !placed.has(c.t.id)).slice(0, lookahead)
    if (!candidates.length) break

    let best = candidates[0]
    let bestValue = -Infinity

    for (const [i, c] of candidates.entries()) {
      if (blockedByFranchise(c.t) && candidates.length > 1) continue
      // Position cost keeps the pick anchored near the top of the ranking.
      const value = c.score - diversityPenalty(c.t, run) - i * 2.5
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
    run.directors.push(best.t.director)
    run.franchises.push(FRANCHISE[best.t.id]?.franchise)
    run.scores.push(best.score)
  }

  return out
}
