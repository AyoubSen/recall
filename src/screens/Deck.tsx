import { useCallback, useEffect, useRef, useState } from 'react'
import { Bookmark, Check, HelpCircle, PartyPopper, SlidersHorizontal, Undo2, X } from 'lucide-react'
import { FiltersDialog } from '../components/FiltersDialog'
import { SwipeCard } from '../components/SwipeCard'
import { Button, EmptyState, IconButton, cx } from '../components/ui'
import { useStore } from '../store'
import type { TitleStatus } from '../types'

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

export function Deck({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const { deck, setStatus, undo, history, sessionCount, watchedCount, filters, setFilters } =
    useStore()
  const [filtersOpen, setFiltersOpen] = useState(false)
  /**
   * Id of the last title whose status was written. Guards against double
   * classification. Using an id rather than a timed lock means the guard
   * clears itself the moment a different card reaches the top, so the deck can
   * never wedge.
   */
  const committed = useRef<string | null>(null)

  const current = deck[0]
  const next = deck[1]

  // Preload the next few posters so a card never appears without artwork.
  useEffect(() => {
    for (const t of deck.slice(1, 5)) {
      if (!t.posterUrl) continue
      const img = new Image()
      img.src = t.posterUrl
    }
  }, [deck])

  /**
   * The single place a status is written. Buttons, keys and finished drags all
   * funnel through here, and the id guard means one card can never be
   * classified twice however the inputs overlap.
   */
  const commit = useCallback(
    (status: TitleStatus) => {
      if (!current || committed.current === current.id) return
      committed.current = current.id
      setStatus(current.id, status)
    },
    [current, setStatus],
  )

  // Keyboard classification. `event.repeat` is ignored so holding a key cannot
  // race through the deck.
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

      {current ? (
        <>
          {/* Fixed height so the action row never moves between titles, but
              viewport-relative so the buttons stay visible on short laptops. */}
          <div
            className="relative w-full"
            style={{ height: 'clamp(400px, calc(100vh - 366px), 580px)' }}
          >
            {next && (
              <div
                aria-hidden
                className="absolute inset-x-4 -bottom-3 top-6 rounded-card border border-ink-700 bg-ink-850 shadow-deck"
              />
            )}
            <SwipeCard key={current.id} title={current} onResolve={commit} />
          </div>

          <div className="grid grid-cols-4 gap-3">
            {ACTION_BUTTONS.map(({ status, label, hint, icon: Icon, cls }) => (
              <button
                key={status}
                onClick={() => commit(status)}
                title={`${label} (${hint})`}
                className={cx(
                  'flex h-20 flex-col items-center justify-center gap-1.5 rounded-control border bg-ink-900 transition-colors',
                  cls,
                )}
              >
                <Icon size={22} />
                <span className="text-[11px] font-semibold">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col items-center gap-2 text-sm text-text-low">
            <p>{deck.length} left with these filters</p>
            <p className="hidden items-center gap-1.5 text-xs sm:flex">
              <Key>←</Key> not watched
              <Key>→</Key> watched
              <Key>↑</Key> watchlist
              <Key>S</Key> not sure
              <Key>⌘Z</Key> undo
            </p>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<PartyPopper size={22} />}
          title="Deck cleared"
          body="You have sorted every title matching your current filters. Widen the filters to keep going, or review what you have remembered so far."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="primary" onClick={() => setFiltersOpen(true)}>
                Change filters
              </Button>
              <Button onClick={onOpenLibrary}>Open library</Button>
            </div>
          }
        />
      )}

      <FiltersDialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={filters}
        onApply={setFilters}
      />
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
