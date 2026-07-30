/**
 * Minimal deck-ordering metadata kept *outside* catalog.ts so the catalogue
 * stays a plain list that a real provider (TMDB) can replace wholesale.
 *
 * Only entries that genuinely need it appear here — everything else falls back
 * to derived values in ranking.ts.
 */

/** Titles a typical viewer recognises on sight, beyond what popularity implies. */
export const ICONIC = new Set<string>([
  'm-shawshank',
  'm-godfather',
  'm-pulp-fiction',
  'm-matrix',
  'm-titanic',
  'm-jurassic-park',
  'm-back-to-the-future',
  'm-forrest-gump',
  'm-jaws',
  'm-shining',
  'm-lotr-fellowship',
  'm-gladiator',
  'm-fight-club',
  'm-dark-knight',
  'm-inception',
  'm-interstellar',
  's-friends',
  's-the-office',
  's-breaking-bad',
  's-game-of-thrones',
  's-stranger-things',
  's-seinfeld',
  's-squid-game',
  's-money-heist',
])

/**
 * Franchise groupings. `order` is release order within the franchise — the deck
 * never shows a later entry before an earlier one that is still unsorted.
 * Only franchises with more than one catalogue entry actually constrain
 * anything; single-entry groups are harmless and document intent.
 */
export const FRANCHISE: Record<string, { franchise: string; order: number }> = {
  's-breaking-bad': { franchise: 'breaking-bad', order: 1 },
  's-better-call-saul': { franchise: 'breaking-bad', order: 2 },
  'm-blade-runner-2049': { franchise: 'blade-runner', order: 2 },
  'm-alien': { franchise: 'alien', order: 1 },
  'm-mad-max-fury-road': { franchise: 'mad-max', order: 4 },
  'm-lotr-fellowship': { franchise: 'lord-of-the-rings', order: 1 },
  'm-matrix': { franchise: 'matrix', order: 1 },
  'm-dune': { franchise: 'dune', order: 1 },
  'm-godfather': { franchise: 'godfather', order: 1 },
  'm-jurassic-park': { franchise: 'jurassic-park', order: 1 },
  'm-back-to-the-future': { franchise: 'back-to-the-future', order: 1 },
  'm-spider-verse': { franchise: 'spider-verse', order: 1 },
  's-the-mandalorian': { franchise: 'star-wars', order: 1 },
}
