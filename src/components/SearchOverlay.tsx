import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { localProvider } from '../data/provider'
import { useStore } from '../store'
import type { Title } from '../types'
import { TitleRow } from './TitleItem'
import { EmptyState, IconButton } from './ui'

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { statusOf, setStatus, resetStatus } = useStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Title[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      window.setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => {
    let cancelled = false
    localProvider.searchTitles(query).then((r) => {
      if (!cancelled) setResults(r)
    })
    return () => {
      cancelled = true
    }
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const trimmed = useMemo(() => query.trim(), [query])
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950/95">
      <header className="border-b border-ink-800">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-5 py-5">
          <Search size={20} className="shrink-0 text-text-low" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a film, series, actor or director…"
            className="h-11 flex-1 bg-transparent text-lg outline-none placeholder:text-text-low"
          />
          <IconButton label="Close search" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-5 py-6">
          {!trimmed ? (
            <EmptyState
              icon={<Search size={22} />}
              title="Search the catalogue"
              body="Look a title up directly and mark it watched, watchlisted, not watched or not sure without swiping."
            />
          ) : results.length === 0 ? (
            <EmptyState
              icon={<Search size={22} />}
              title="Nothing matched"
              body={`No catalogue title matches “${trimmed}”. This prototype ships a local catalogue, so coverage is limited.`}
            />
          ) : (
            <div className="space-y-3">
              {results.map((t) => (
                <TitleRow
                  key={t.id}
                  title={t}
                  status={statusOf(t.id)}
                  onSet={(s) => setStatus(t.id, s)}
                  onReset={() => resetStatus(t.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
