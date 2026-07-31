import type { TasteProfile, Title } from '../../types'
import type { Recommendation } from './types'

/**
 * Deterministic recommendation scoring, shared by both providers so the
 * explanations read the same whichever catalogue is behind them.
 */
export function scoreCandidates(
  candidates: Title[],
  profile: TasteProfile,
  exclude: Set<string>,
  genreFrequency: Map<string, number>,
  limit = 30,
): Recommendation[] {
  const genreWeight = new Map(profile.genres.map((g) => [g.name, g.count]))
  const topGenres = profile.genres.slice(0, 3).map((g) => g.name)
  const topDecades = profile.decades.slice(0, 2).map((d) => d.decade)
  const favouritePeople = new Set(profile.people.slice(0, 5).map((p) => p.name))

  const seen = new Set<string>()
  const out: Recommendation[] = []

  for (const title of candidates) {
    if (exclude.has(title.id) || seen.has(title.id)) continue
    seen.add(title.id)

    let score = 0
    const reasons: string[] = []

    const genreHits = title.genres.filter((g) => genreWeight.has(g))
    if (genreHits.length) {
      score += genreHits.reduce((s, g) => s + (genreWeight.get(g) ?? 0), 0) * 3
      // Prefer the most distinctive shared genre so every row does not read
      // "because you watch drama".
      const lead = [...genreHits]
        .filter((g) => topGenres.includes(g))
        .sort(
          (a, b) =>
            (genreWeight.get(b) ?? 0) / (genreFrequency.get(b) ?? 1) -
            (genreWeight.get(a) ?? 0) / (genreFrequency.get(a) ?? 1),
        )[0]
      if (lead) reasons.push(`Because you watch a lot of ${lead.toLowerCase()}`)
      else reasons.push('Similar to titles in your watched library')
    }

    if (title.year) {
      const decade = `${Math.floor(title.year / 10) * 10}s`
      if (topDecades.includes(decade)) {
        score += 6
        reasons.push(`From one of your favourite decades — the ${decade}`)
      }
    }

    const person = [title.director, ...(title.cast ?? [])].find(
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

  return out.sort((a, b) => b.score - a.score || a.title.id.localeCompare(b.title.id)).slice(0, limit)
}

export function genreFrequencyOf(titles: Title[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of titles) for (const g of t.genres) m.set(g, (m.get(g) ?? 0) + 1)
  return m
}
