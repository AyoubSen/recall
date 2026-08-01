import type { CalibrationAnswer, Title, TitleStatus, Viewer } from '../types'

/**
 * The viewer model: who is doing the recognising, and how that reshapes what
 * counts as recognisable.
 *
 * Kept separate from ranking.ts, which stays about *ordering* a candidate
 * window. Everything here is pure and deterministic so the fit can be checked
 * directly, without a deck or a network.
 */

const CURRENT_YEAR = 2026

/** Nobody outside this range is being modelled; the fit is clamped to it. */
const MIN_BIRTH_YEAR = 1930
const MAX_BIRTH_YEAR = CURRENT_YEAR - 8

export const DEFAULT_VIEWER: Viewer = {
  birthYear: 0,
  markets: [],
  confidence: 0,
  calibrated: false,
}

/** True when the viewer carries enough signal to be worth applying at all. */
export const hasSignal = (v?: Viewer): v is Viewer =>
  !!v && v.calibrated && v.confidence > 0 && v.birthYear > 0

/* ------------------------------------------------------------ era affinity */

/**
 * How likely this release year is to fall inside the viewer's watching life.
 *
 * The shape, in viewer-age-at-release terms:
 *
 *   age < 0     never lived through it — reachable only as canon
 *   age 0-7     too young at the time — same, mostly
 *   age 8-30    the formative window, peaking around 14-22
 *   age > 30    still watching, but less definitively
 *
 * `fame` (0-1) modulates the pre-window penalty and nothing else. This is the
 * part that matters most: a 20-year-old has certainly seen The Godfather, so
 * penalising everything released before they were born would wrongly bury the
 * canon. Famous old titles keep their score; obscure old titles lose it.
 *
 * Returns roughly -14..+18 before confidence scaling.
 */
export function eraAffinity(year: number, birthYear: number, fame: number): number {
  if (!year || !birthYear) return 0
  const age = year - birthYear
  const f = Math.max(0, Math.min(1, fame))

  if (age < 8) {
    // Only the canon survives here, and only in proportion to its fame.
    return -14 * (1 - f)
  }

  if (age <= 30) {
    // Triangular peak at 18: full credit mid-window, tapering to the edges.
    const distance = Math.abs(age - 18)
    return 18 - (distance / 12) * 8
  }

  // Past the formative window the curve decays but never goes negative — people
  // keep watching new releases their whole lives.
  return Math.max(0, 10 - (age - 30) * 0.25)
}

/* --------------------------------------------------------- market affinity */

/**
 * Language exposure, relative to the viewer rather than to English.
 *
 * The rule this replaces subtracted a flat penalty from every non-English
 * title, which is backwards for a non-anglophone viewer: it buried exactly the
 * titles they were most likely to have seen. English stays neutral because it
 * is distributed everywhere regardless of the viewer's own market.
 */
export function marketAffinity(languageCode: string | undefined, markets: string[]): number {
  const lang = languageCode || 'en'
  // English is tested *first* and scored neutrally. It is normally present in
  // `markets` too, and if that branch won, English would tie with the viewer's
  // own market — which would defeat the point, since the goal is to lift their
  // market relative to the English default rather than alongside it.
  if (lang === 'en') return 0
  if (markets.includes(lang)) return 10
  return -10
}

/* ------------------------------------------------------------------ fitting */

/** Rough 0-1 fame, from the same reach signal recognition scoring trusts. */
export function fameOf(t: Title): number {
  const votes = t.voteCount ?? 0
  const byVotes = votes ? Math.log10(votes + 1) / Math.log10(20001) : 0
  const byPopularity = (t.popularity ?? 0) / 100
  return Math.max(0, Math.min(1, Math.max(byVotes, byPopularity)))
}

/** The viewer's own locale, as a starting guess for markets. */
function localeMarkets(): string[] {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
    const codes = langs
      .map((l) => l.split('-')[0]?.toLowerCase())
      .filter((c): c is string => !!c && c.length === 2)
    return [...new Set(codes)]
  } catch {
    return []
  }
}

/**
 * Fit a viewer from calibration answers.
 *
 * The estimator is deliberately simple and robust rather than clever — a dozen
 * answers cannot support anything more, and a confidently wrong fit is worse
 * than a cautious one.
 *
 *   birthYear  a "watched" probe is evidence the viewer was in their watching
 *              years at its release, so it votes for `year - 18`. A "not
 *              watched" answer on a *famous* old probe is evidence of the
 *              opposite — that the viewer was not around for it — and votes
 *              later. Fame weights the negative vote, because skipping an
 *              obscure title says nothing.
 *
 *   markets    any non-English probe marked watched contributes its language,
 *              on top of the browser locale.
 *
 *   confidence rises with the number of informative answers and falls when the
 *              answers are all the same, which carries no positional signal.
 */
export function fitViewer(answers: CalibrationAnswer[]): Viewer {
  const answered = answers.filter((a) => a.watched !== null)
  const watched = answered.filter((a) => a.watched)
  const notWatched = answered.filter((a) => !a.watched)

  const markets = new Set(localeMarkets())
  for (const a of watched) {
    const code = a.title.languageCode
    if (code && code !== 'en') markets.add(code)
  }
  // English is assumed reachable for everyone; it is scored neutrally anyway.
  markets.add('en')

  // Pass one: watched probes only. Each says "I was in my watching years when
  // this came out", so it votes for `year - 18`.
  const votes: { year: number; weight: number }[] = []
  for (const a of watched) {
    if (!a.title.year) continue
    votes.push({ year: a.title.year - 18, weight: 1 })
  }

  const provisional = votes.length
    ? votes.reduce((s, v) => s + v.year, 0) / votes.length
    : 0

  // Pass two: negative evidence, and only in one direction. Missing something
  // famous and *old* suggests it predates the viewer, which votes later. The
  // mirror image is not true — missing a recent release says the viewer is
  // older, not younger — so applying this symmetrically would drag every
  // estimate toward the present. Restricting it to probes older than the
  // provisional fit keeps the inference to the case it actually supports.
  for (const a of notWatched) {
    if (!a.title.year || !provisional) continue
    if (a.title.year > provisional + 8) continue
    const fame = fameOf(a.title)
    // Not having seen an obscure film is not evidence of anything.
    if (fame < 0.5) continue
    votes.push({ year: a.title.year + 4, weight: fame * 0.6 })
  }

  const totalWeight = votes.reduce((s, v) => s + v.weight, 0)
  const birthYear = totalWeight
    ? Math.round(
        Math.max(
          MIN_BIRTH_YEAR,
          Math.min(MAX_BIRTH_YEAR, votes.reduce((s, v) => s + v.year * v.weight, 0) / totalWeight),
        ),
      )
    : 0

  // Answers that all point the same way pin down a language but not an era, so
  // they earn less trust than a mixed set.
  const coverage = Math.min(1, answered.length / 10)
  const balance = answered.length
    ? 1 - Math.abs(watched.length - notWatched.length) / answered.length
    : 0
  const confidence = birthYear ? Math.max(0, Math.min(1, coverage * (0.45 + 0.55 * balance))) : 0

  return {
    birthYear,
    markets: [...markets],
    confidence: Number(confidence.toFixed(2)),
    calibrated: true,
  }
}

/* ------------------------------------------------- fitting from swipe history */

/** Below this a bucket is noise, not evidence. */
const MIN_BUCKET_SAMPLE = 5

/**
 * Titles newer than this are excluded from fitting entirely.
 *
 * "Not watched" on a title that is barely out — or not out at all — means "no
 * one has seen this yet", not "wrong era for me". Counting those would drag
 * every era estimate earlier, and they are the single largest block of
 * guaranteed-"no" answers in the deck.
 */
const FIT_MAX_YEAR = CURRENT_YEAR - 2

/** Sample size at which the swipe fit is trusted as much as it ever will be. */
const CONFIDENCE_SATURATION = 100

interface Bucket {
  watched: number
  total: number
}

const addTo = (m: Map<string | number, Bucket>, key: string | number, watched: boolean) => {
  const b = m.get(key) ?? { watched: 0, total: 0 }
  b.total++
  if (watched) b.watched++
  m.set(key, b)
}

const rateOf = (b: Bucket) => (b.total ? b.watched / b.total : 0)

export interface HistoryFit {
  viewer: Viewer
  /** Classifications that carried signal, after exclusions. */
  sample: number
  /**
   * Languages the history has enough evidence on to overrule the calibration
   * prior — in either direction. Membership here means "the swipes decide";
   * absence means "keep whatever the probes said".
   */
  decided: Set<string>
}

/**
 * Fit a viewer from everything the user has classified.
 *
 * Deliberately **rate-based, not count-based**, and that is the whole trick.
 *
 * The deck decides how much of each era and language the user is *exposed* to,
 * so counting watched titles per bucket would mostly measure the deck's own
 * bias — and since the deck is itself viewer-ordered, refitting from counts
 * would compound that bias on every pass until the deck collapsed onto whatever
 * it already favoured. What the deck does *not* control is the rate at which the
 * user says yes within a bucket. Rates are therefore roughly invariant to
 * exposure, which is what makes continuous refitting safe.
 *
 * Only `watched` and `not_watched` carry signal. `watchlist` means "I know it
 * and have not seen it", which says nothing about era exposure, and `unsure` is
 * explicitly no answer.
 */
export function fitFromHistory(
  titles: Title[],
  statuses: Record<string, { status: TitleStatus }>,
): HistoryFit {
  const byDecade = new Map<string | number, Bucket>()
  const byLanguage = new Map<string | number, Bucket>()
  let watchedTotal = 0
  let sample = 0

  for (const t of titles) {
    const status = statuses[t.id]?.status
    if (status !== 'watched' && status !== 'not_watched') continue
    if (!t.year || t.year > FIT_MAX_YEAR) continue

    const watched = status === 'watched'
    sample++
    if (watched) watchedTotal++
    addTo(byDecade, Math.floor(t.year / 10) * 10, watched)
    addTo(byLanguage, t.languageCode ?? (t.language === 'English' ? 'en' : '?'), watched)
  }

  // Era: the rate-weighted centre of the decades the viewer actually says yes to.
  let weightSum = 0
  let weighted = 0
  let qualifyingDecades = 0
  for (const [decade, bucket] of byDecade) {
    if (bucket.total < MIN_BUCKET_SAMPLE) continue
    qualifyingDecades++
    const rate = rateOf(bucket)
    if (rate <= 0) continue
    weighted += (Number(decade) + 5) * rate
    weightSum += rate
  }

  const birthYear = weightSum
    ? Math.round(
        Math.max(MIN_BIRTH_YEAR, Math.min(MAX_BIRTH_YEAR, weighted / weightSum - 18)),
      )
    : 0

  // Market: a language whose watch rate clearly beats the viewer's own baseline.
  // Comparing against their baseline rather than an absolute threshold is what
  // lets this work for a heavy watcher and a light one alike.
  const baseline = sample ? watchedTotal / sample : 0
  const markets: string[] = []
  const decided = new Set<string>()
  for (const [code, bucket] of byLanguage) {
    const lang = String(code)
    if (lang === '?' || bucket.total < MIN_BUCKET_SAMPLE) continue
    // Enough evidence to overrule the calibration prior for this language.
    decided.add(lang)
    if (rateOf(bucket) > Math.max(baseline * 1.3, 0.02)) markets.push(lang)
  }

  // Grows with evidence and never falls — unlike the probe fitter's balance
  // term, which would punish a swipe log for being mostly "no", which is what
  // every honest swipe log looks like.
  const volume = Math.min(1, sample / CONFIDENCE_SATURATION)
  const spread = Math.min(1, qualifyingDecades / 3)
  const confidence = birthYear ? Number((volume * (0.5 + 0.5 * spread)).toFixed(2)) : 0

  return { viewer: { birthYear, markets, confidence, calibrated: true }, sample, decided }
}

/**
 * Combine the calibration prior with the swipe fit.
 *
 * Probe answers are *unbiased* — chosen to span eras and markets — while swipes
 * are only ever whatever the deck chose to show. So calibration stays the prior
 * and hands over gradually as the swipe fit earns it.
 */
export function blendViewers(calibrated: Viewer, fit: HistoryFit): Viewer {
  const hist = fit.viewer
  if (!hist.birthYear) return calibrated
  if (!hasSignal(calibrated)) return hist

  const w = Math.min(1, fit.sample / CONFIDENCE_SATURATION)
  const { decided } = fit

  // A language the history has enough data on is settled by the history —
  // including being dropped, which is the negative signal the deck previously
  // threw away. Anything it has not seen enough of keeps the probe's answer.
  const markets = new Set<string>()
  for (const lang of calibrated.markets) {
    if (!decided.has(lang)) markets.add(lang)
  }
  for (const lang of hist.markets) markets.add(lang)

  return {
    birthYear: Math.round(calibrated.birthYear * (1 - w) + hist.birthYear * w),
    markets: [...markets],
    confidence: Number((calibrated.confidence * (1 - w) + hist.confidence * w).toFixed(2)),
    calibrated: true,
  }
}

/**
 * Development-only inspection hook, mirroring `__recallDiscovery`. The project
 * has no test runner, so the pure scoring pieces are exposed here to be
 * exercised directly from the console.
 */
if (import.meta.env.DEV) {
  ;(globalThis as unknown as Record<string, unknown>).__recallViewer = {
    eraAffinity,
    marketAffinity,
    fitViewer,
    fitFromHistory,
    blendViewers,
    fameOf,
    hasSignal,
  }
}

/** Human-readable summary of a fit, for Profile and dev diagnostics. */
export function describeViewer(v: Viewer): string {
  if (!hasSignal(v)) return 'Not calibrated — showing broadly popular titles'
  const peak = v.birthYear + 18
  const decade = `${Math.floor(peak / 10) * 10}s`
  const langs = v.markets.slice(0, 3).join(', ')
  return `Mostly ${decade} onwards · ${langs}`
}
