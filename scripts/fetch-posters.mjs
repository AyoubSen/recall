/**
 * Build-time script: resolve a TMDB poster for every catalogue entry and write
 * src/data/posters.json (id -> absolute image.tmdb.org URL).
 *
 * Reads TMDB_TOKEN (v4 read access token) from .env / .env.local. The token is
 * only used here; the app itself loads plain public CDN URLs and ships no key.
 *
 *   node scripts/fetch-posters.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const CATALOG = resolve(ROOT, 'src/data/catalog.ts')
const OUT = resolve(ROOT, 'src/data/posters.json')

const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

function loadToken() {
  if (process.env.TMDB_TOKEN) return process.env.TMDB_TOKEN.trim()
  for (const f of ['.env.local', '.env']) {
    const p = resolve(ROOT, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=')
      if (i > 0 && line.slice(0, i).trim() === 'TMDB_TOKEN') return line.slice(i + 1).trim()
    }
  }
  throw new Error('TMDB_TOKEN not found in environment or .env / .env.local')
}

const TOKEN = loadToken()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function tmdb(path, params) {
  const url = new URL(`https://api.themoviedb.org/3${path}`)
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v))

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
    })
    if (res.status === 429) {
      await sleep(1500 * (attempt + 1))
      continue
    }
    if (res.status === 401) throw new Error('TMDB rejected the token (401)')
    if (!res.ok) {
      if (attempt === 3) throw new Error(`HTTP ${res.status}`)
      await sleep(600 * (attempt + 1))
      continue
    }
    return res.json()
  }
}

function readCatalog() {
  const src = readFileSync(CATALOG, 'utf8')
  const entries = []
  const re =
    /id:\s*'([^']+)',\s*\n\s*type:\s*'(movie|series)',\s*\n\s*title:\s*'((?:[^'\\]|\\.)*)',\s*\n\s*year:\s*(\d{4})/g
  let m
  while ((m = re.exec(src))) {
    entries.push({ id: m[1], type: m[2], title: m[3].replace(/\\'/g, "'"), year: Number(m[4]) })
  }
  return entries
}

const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')

async function resolveOne(entry) {
  const isMovie = entry.type === 'movie'
  const endpoint = isMovie ? '/search/movie' : '/search/tv'

  // First pass constrained by year, then an unconstrained fallback.
  const attempts = [
    { query: entry.title, [isMovie ? 'primary_release_year' : 'first_air_date_year']: entry.year },
    { query: entry.title },
  ]

  for (const params of attempts) {
    const data = await tmdb(endpoint, { include_adult: false, language: 'en-US', ...params })
    const results = data?.results ?? []
    if (!results.length) continue

    const scored = results
      .map((r) => {
        const name = isMovie ? r.title : r.name
        const date = isMovie ? r.release_date : r.first_air_date
        const y = date ? Number(date.slice(0, 4)) : null
        let score = 0
        if (norm(name) === norm(entry.title)) score += 5
        else if (norm(name).includes(norm(entry.title))) score += 2
        if (y != null && Math.abs(y - entry.year) <= 1) score += 4
        else if (y != null && Math.abs(y - entry.year) <= 3) score += 1
        if (r.poster_path) score += 3
        score += Math.min(2, (r.popularity ?? 0) / 50)
        return { r, name, y, score }
      })
      .sort((a, b) => b.score - a.score)

    const best = scored.find((s) => s.r.poster_path)
    if (!best) continue

    const exact = norm(best.name) === norm(entry.title)
    const yearOk = best.y != null && Math.abs(best.y - entry.year) <= 1
    return {
      ...entry,
      status: 'ok',
      url: IMAGE_BASE + best.r.poster_path,
      matched: best.name,
      matchedYear: best.y,
      suspect: !exact || !yearOk,
    }
  }
  return { ...entry, status: 'no-poster' }
}

const entries = readCatalog()
console.log(`Catalogue entries parsed: ${entries.length}\n`)

const results = []
for (const [i, entry] of entries.entries()) {
  try {
    const r = await resolveOne(entry)
    results.push(r)
    const flag = r.status !== 'ok' ? 'MISS' : r.suspect ? 'CHECK' : 'ok'
    console.log(
      `${String(i + 1).padStart(3)}/${entries.length} ${flag.padEnd(5)} ${entry.title} (${entry.year})` +
        (r.suspect ? `  -> matched "${r.matched}" (${r.matchedYear})` : ''),
    )
  } catch (err) {
    results.push({ ...entry, status: `error: ${err.message}` })
    console.log(`     ERR   ${entry.title}: ${err.message}`)
  }
  await sleep(60)
}

const map = Object.fromEntries(results.filter((r) => r.status === 'ok').map((r) => [r.id, r.url]))
writeFileSync(OUT, JSON.stringify(map, null, 2) + '\n')

const ok = results.filter((r) => r.status === 'ok').length
const suspect = results.filter((r) => r.suspect)
console.log(`\nResolved ${ok}/${entries.length} (${Math.round((ok / entries.length) * 100)}%)`)
if (suspect.length) {
  console.log(`\nNeeds a look (${suspect.length}):`)
  for (const s of suspect) console.log(`  ${s.title} (${s.year}) -> "${s.matched}" (${s.matchedYear})`)
}
console.log(`\nWrote ${OUT}`)
