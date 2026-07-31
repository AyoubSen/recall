import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Search, X } from 'lucide-react'
import { catalogProvider, usingTmdb } from '../data/provider'
import { describeError } from '../data/tmdb/client'
import { useStore } from '../store'
import type { Title } from '../types'
import { TitleRow } from './TitleItem'
import { Button, EmptyState, IconButton } from './ui'

const DEBOUNCE_MS = 350

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { statusOf, setStatus, resetStatus, knownTitles } = useStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Title[]>([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /** Monotonic id — only the newest query may write results. */
  const requestId = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setResults([])
    setError(null)
    setPage(1)
    window.setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  const run = useCallback(
    async (q: string, nextPage: number) => {
      const id = ++requestId.current
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setError(null)
      try {
        const res = await catalogProvider.searchTitles(q, nextPage, controller.signal)
        // A newer query started while this was in flight — discard it.
        if (id !== requestId.current) return
        setResults((prev) => {
          const merged = nextPage === 1 ? res.items : [...prev, ...res.items]
          const seen = new Set<string>()
          return merged.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
        })
        setMore(!res.exhausted)
        setPage(nextPage)
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        if (id !== requestId.current) return
        setError(describeError(err))
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [],
  )

  // Debounced search — never one request per keystroke.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      requestId.current++
      abortRef.current?.abort()
      setResults([])
      setLoading(false)
      setError(null)
      return
    }
    const t = window.setTimeout(() => void run(q, 1), DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query, run])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => () => abortRef.current?.abort(), [])

  if (!open) return null

  const trimmed = query.trim()
  // Offline/no-token fallback: match against titles already cached locally.
  const localMatches = !usingTmdb
    ? []
    : knownTitles.filter((t) => t.title.toLowerCase().includes(trimmed.toLowerCase())).slice(0, 5)
  const shown = results.length ? results : error ? localMatches : results

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950/95">
      <header className="border-b border-ink-800">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-5 py-5">
          {loading ? (
            <Loader2 size={20} className="shrink-0 animate-spin text-accent" />
          ) : (
            <Search size={20} className="shrink-0 text-text-low" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              usingTmdb ? 'Search every film and series on TMDB…' : 'Search the demo catalogue…'
            }
            className="h-11 flex-1 bg-transparent text-lg outline-none placeholder:text-text-low"
          />
          <IconButton label="Close search" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-3 px-5 py-6">
          {!trimmed ? (
            <EmptyState
              icon={<Search size={22} />}
              title="Search the catalogue"
              body="Look a title up directly and mark it watched, watchlisted, not watched or not sure without swiping."
            />
          ) : error && !shown.length ? (
            <EmptyState
              icon={<AlertTriangle size={22} />}
              title="Search failed"
              body={error}
              action={
                <Button variant="primary" onClick={() => void run(trimmed, 1)}>
                  Try again
                </Button>
              }
            />
          ) : !shown.length && !loading ? (
            <EmptyState
              icon={<Search size={22} />}
              title="Nothing matched"
              body={`No film or series matches “${trimmed}”.`}
            />
          ) : (
            <>
              {error && shown.length > 0 && (
                <p className="rounded-control border border-skip/30 bg-skip/10 px-4 py-3 text-sm text-skip">
                  {error} Showing titles already in your library.
                </p>
              )}
              {shown.map((t) => (
                <TitleRow
                  key={t.id}
                  title={t}
                  status={statusOf(t.id)}
                  onSet={(s) => setStatus(t, s)}
                  onReset={() => resetStatus(t.id)}
                />
              ))}
              {more && !error && (
                <div className="pt-2">
                  <Button
                    fullWidth
                    disabled={loading}
                    onClick={() => void run(trimmed, page + 1)}
                  >
                    {loading ? 'Loading…' : 'Load more results'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
