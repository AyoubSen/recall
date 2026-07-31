/**
 * Thin TMDB HTTP layer. Everything network-related lives here, so swapping the
 * direct calls for a backend proxy later means changing BASE and the auth
 * header — no screen or provider signature changes.
 */

const BASE = 'https://api.themoviedb.org/3'

const TOKEN: string = (import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN ?? '').trim()

export const hasTmdbToken = TOKEN.length > 0

export class TmdbError extends Error {
  status?: number
  retryable: boolean

  constructor(message: string, status?: number, retryable = false) {
    super(message)
    this.name = 'TmdbError'
    this.status = status
    this.retryable = retryable
  }
}

/** User-facing message. Never includes the token or raw response bodies. */
export function describeError(err: unknown): string {
  if (err instanceof TmdbError) {
    if (err.status === 401) return 'TMDB rejected the configured token.'
    if (err.status === 429) return 'TMDB is rate limiting requests. Try again in a moment.'
    if (err.status && err.status >= 500) return 'TMDB is having trouble right now.'
    return err.message
  }
  return 'Could not reach TMDB. Check your connection.'
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface GetOptions {
  signal?: AbortSignal
  /** Bounded retries for transient failures only. Never an endless loop. */
  retries?: number
}

export async function tmdbGet<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  { signal, retries = 2 }: GetOptions = {},
): Promise<T> {
  if (!hasTmdbToken) throw new TmdbError('No TMDB token configured.')

  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  }

  let attempt = 0
  for (;;) {
    let res: Response
    try {
      res = await fetch(url, {
        signal,
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
      })
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err
      if (attempt < retries) {
        attempt++
        await sleep(400 * attempt)
        continue
      }
      throw new TmdbError('Network request failed.', undefined, true)
    }

    if (res.ok) return (await res.json()) as T

    // 429 carries Retry-After; respect it once or twice, then surface it.
    if (res.status === 429 && attempt < retries) {
      const wait = Number(res.headers.get('Retry-After') ?? 1)
      attempt++
      await sleep(Math.min(5, Math.max(1, wait)) * 1000)
      continue
    }
    if (res.status >= 500 && attempt < retries) {
      attempt++
      await sleep(500 * attempt)
      continue
    }

    throw new TmdbError(
      res.status === 401 ? 'Unauthorized.' : `TMDB request failed (${res.status}).`,
      res.status,
      res.status === 429 || res.status >= 500,
    )
  }
}

/* ------------------------------------------------------------------ images */

const IMG = 'https://image.tmdb.org/t/p'

/** Poster sized for the deck card and grid tiles, not the original asset. */
export const posterUrl = (path: string | null | undefined, size: 'w342' | 'w500' = 'w500') =>
  path ? `${IMG}/${size}${path}` : undefined

export const backdropUrl = (path: string | null | undefined, size: 'w780' | 'w1280' = 'w780') =>
  path ? `${IMG}/${size}${path}` : undefined
