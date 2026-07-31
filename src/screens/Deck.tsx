import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bookmark,
  Check,
  HelpCircle,
  Loader2,
  PartyPopper,
  SlidersHorizontal,
  Undo2,
  WifiOff,
  X,
} from 'lucide-react'
import { FiltersDialog } from '../components/FiltersDialog'
import { SwipeCard } from '../components/SwipeCard'
import { Button, EmptyState, IconButton, cx } from '../components/ui'
import { catalogProvider } from '../data/provider'
import { useDiscovery } from '../data/useDiscovery'
import { useStore } from '../store'
import type { Title, TitleStatus } from '../types'

const ACTION_BUTTONS: {
  status: TitleStatus
  label: string
  hint: string
  icon: typeof Check
  cls: string
}[] = [
  {
    status: 'not_watched',
    label: 'Not watched',
    hint: '←',
    icon: X,
    cls: 'border-skip/40 text-skip hover:bg-skip/15 active:bg-skip/30',
  },
  {
    status: 'unsure',
    label: 'Not sure',
    hint: 'S',
    icon: HelpCircle,
    cls: 'border-ink-700 text-text-mid hover:bg-ink-800 hover:text-text-hi active:bg-ink-700',
  },
  {
    status: 'watchlist',
    label: 'Watchlist',
    hint: '↑',
    icon: Bookmark,
    cls: 'border-later/40 text-later hover:bg-later/15 active:bg-later/30',
  },
  {
    status: 'watched',
    label: 'Watched',
    hint: '→',
    icon: Check,
    cls: 'border-watched/40 text-watched hover:bg-watched/15 active:bg-watched/30',
  },
]

/** Fixed card frame — the action row must never move between titles. */
const CARD_FRAME = { height: 'clamp(400px, calc(100vh - 366px), 580px)' } as const

export function Deck({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const {
    setStatus,
    undo,
    history,
    sessionCount,
    watchedCount,
    filters,
    setFilters,
    statuses,
    usingTmdb,
  } = useStore()

  const { deck, loading, error, exhausted, retry } = useDiscovery(filters, statuses)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [details, setDetails] = useState<Title | null>(null)
  const committed = useRef<string | null>(null)

  const current = deck[0]
  const next = deck[1]
  /** Details are merged in for the visible card only, never for the buffer. */
  const shown = details && current && details.id === current.id ? details : current

  // Preload the next few posters so a card never appears without artwork.
  useEffect(() => {
    for (const t of deck.slice(1, 5)) {
      if (!t.posterUrl) continue
      const img = new Image()
      img.src = t.posterUrl
    }
  }, [deck])

  // Lazily enrich the current card (runtime, seasons, director) — one request
  // per shown card, not one per buffered candidate.
  useEffect(() => {
    if (!current || current.detailed) {
      setDetails(null)
      return
    }
    let cancelled = false
    const controller = new AbortController()
    catalogProvider
      .getTitleDetails(current.id, controller.signal)
      .then((d) => {
        if (!cancelled && d) setDetails(d)
      })
      .catch(() => {
        /* the card stays usable on discovery metadata alone */
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [current])

  const commit = useCallback(
    (status: TitleStatus) => {
      if (!current || committed.current === current.id) return
      committed.current = current.id
      setStatus(shown ?? current, status)
    },
    [current, shown, setStatus],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.isContentEditable)) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          commit('watched')
          break
        case 'ArrowLeft':
          e.preventDefault()
          commit('not_watched')
          break
        case 'ArrowUp':
          e.preventDefault()
          commit('watchlist')
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          commit('unsure')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commit, undo])

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-text-low">This session</p>
          <p className="text-2xl font-bold tracking-tight">
            {sessionCount} <span className="text-base font-medium text-text-mid">sorted</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenLibrary}
            className="hidden h-11 items-center gap-2 rounded-control border border-ink-700 bg-ink-850 px-4 text-sm font-semibold text-text-mid transition-colors hover:border-ink-600 hover:text-text-hi active:bg-ink-700 sm:inline-flex"
          >
            <Check size={16} className="text-watched" />
            {watchedCount} remembered
          </button>
          <IconButton
            label={history.length ? 'Undo last action' : 'Nothing to undo'}
            onClick={undo}
            disabled={history.length === 0}
          >
            <Undo2 size={18} />
          </IconButton>
          <IconButton
            label="Deck filters"
            onClick={() => setFiltersOpen(true)}
            active={
              filters.genres.length > 0 ||
              filters.languages.length > 0 ||
              filters.types.length === 1 ||
              filters.popularity !== 'balanced'
            }
          >
            <SlidersHorizontal size={18} />
          </IconButton>
        </div>
      </div>

      {/* The frame keeps its size in every state so nothing below it jumps. */}
      <div className="relative w-full" style={CARD_FRAME}>
        {current ? (
          <>
            {next && (
              <div
                aria-hidden
                className="absolute inset-x-4 -bottom-3 top-6 rounded-card border border-ink-700 bg-ink-850 shadow-deck"
              />
            )}
            <SwipeCard key={current.id} title={shown ?? current} onResolve={commit} />
          </>
        ) : error ? (
          <FrameMessage
            icon={<WifiOff size={22} />}
            title="Could not load more titles"
            body={error}
            action={
              <Button variant="primary" onClick={retry}>
                Try again
              </Button>
            }
          />
        ) : loading ? (
          <FrameMessage
            icon={<Loader2 size={22} className="animate-spin" />}
            title="Finding titles you might recognise"
            body={
              usingTmdb
                ? 'Loading a fresh page from TMDB.'
                : 'Loading from the bundled demo catalogue.'
            }
          />
        ) : exhausted ? (
          <FrameMessage
            icon={<PartyPopper size={22} />}
            title="Deck cleared"
            body="You have sorted everything matching these filters. Widen them to keep going."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="primary" onClick={() => setFiltersOpen(true)}>
                  Change filters
                </Button>
                <Button onClick={onOpenLibrary}>Open library</Button>
              </div>
            }
          />
        ) : (
          <FrameMessage
            icon={<Loader2 size={22} className="animate-spin" />}
            title="Preparing your deck"
            body="Just a moment."
          />
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {ACTION_BUTTONS.map(({ status, label, hint, icon: Icon, cls }) => (
          <button
            key={status}
            onClick={() => commit(status)}
            disabled={!current}
            title={`${label} (${hint})`}
            className={cx(
              'flex h-20 flex-col items-center justify-center gap-1.5 rounded-control border bg-ink-900 transition-colors',
              'disabled:opacity-40 disabled:pointer-events-none',
              cls,
            )}
          >
            <Icon size={22} />
            <span className="text-[11px] font-semibold">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2 text-sm text-text-low">
        <p className="flex items-center gap-2">
          {deck.length > 0 && <>{deck.length} queued</>}
          {loading && deck.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <Loader2 size={12} className="animate-spin" /> loading more
            </span>
          )}
          {!usingTmdb && (
            <span className="rounded-full border border-ink-700 px-2 py-0.5 text-[11px]">
              demo catalogue
            </span>
          )}
        </p>
        <p className="hidden items-center gap-1.5 text-xs sm:flex">
          <Key>←</Key> not watched
          <Key>→</Key> watched
          <Key>↑</Key> watchlist
          <Key>S</Key> not sure
          <Key>⌘Z</Key> undo
        </p>
      </div>

      <FiltersDialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={filters}
        onApply={setFilters}
      />
    </div>
  )
}

function FrameMessage({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="absolute inset-0 flex items-center">
      <div className="w-full">
        <EmptyState icon={icon} title={title} body={body} action={action} />
      </div>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-2 rounded border border-ink-700 bg-ink-850 px-1.5 py-0.5 font-sans text-[11px] text-text-mid first:ml-0">
      {children}
    </kbd>
  )
}
