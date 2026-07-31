import { useMemo, useState } from 'react'
import { Grid2x2, Library as LibraryIcon, List, Search } from 'lucide-react'
import { PosterCard, TitleRow } from '../components/TitleItem'
import { EmptyState, IconButton, cx } from '../components/ui'
import { CANONICAL_GENRES } from '../data/tmdb/genres'
import { useStore } from '../store'
import type { SortKey, TitleStatus } from '../types'

const TABS: { status: TitleStatus; label: string }[] = [
  { status: 'watched', label: 'Watched' },
  { status: 'watchlist', label: 'Watchlist' },
  { status: 'unsure', label: 'Not sure' },
]

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'year', label: 'Release year' },
  { key: 'title', label: 'Title' },
  { key: 'rating', label: 'Rating' },
]

export function Library() {
  const { titlesByStatus, statusOf, setStatusById, resetStatus, prefs, setPrefs } = useStore()
  const [tab, setTab] = useState<TitleStatus>('watched')
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | 'movie' | 'series'>('all')
  const [genre, setGenre] = useState('all')
  const [decade, setDecade] = useState('all')

  const activeTab = prefs.showNotWatched ? tab : tab === 'not_watched' ? 'watched' : tab
  const base = titlesByStatus(activeTab)

  const decades = useMemo(
    () =>
      Array.from(new Set(base.filter((t) => t.year).map((t) => `${Math.floor(t.year / 10) * 10}s`)))
        .sort()
        .reverse(),
    [base],
  )

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = base.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q)) return false
      if (type !== 'all' && t.type !== type) return false
      if (genre !== 'all' && !t.genres.includes(genre)) return false
      if (decade !== 'all' && `${Math.floor(t.year / 10) * 10}s` !== decade) return false
      return true
    })
    const sorted = [...filtered]
    if (prefs.librarySort === 'year') sorted.sort((a, b) => b.year - a.year)
    if (prefs.librarySort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title))
    if (prefs.librarySort === 'rating') sorted.sort((a, b) => b.rating - a.rating)
    return sorted // 'recent' keeps store order (newest status first)
  }, [base, query, type, genre, decade, prefs.librarySort])

  const tabs = prefs.showNotWatched
    ? [...TABS, { status: 'not_watched' as TitleStatus, label: 'Never watched' }]
    : TABS

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Library</h1>
        <div className="flex items-center gap-2">
          <IconButton
            label="Grid view"
            active={prefs.libraryView === 'grid'}
            onClick={() => setPrefs({ libraryView: 'grid' })}
          >
            <Grid2x2 size={18} />
          </IconButton>
          <IconButton
            label="List view"
            active={prefs.libraryView === 'list'}
            onClick={() => setPrefs({ libraryView: 'list' })}
          >
            <List size={18} />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.status}
            onClick={() => setTab(t.status)}
            aria-current={activeTab === t.status}
            className={cx(
              'h-11 rounded-control border px-5 text-sm font-semibold transition-colors',
              activeTab === t.status
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-ink-700 bg-ink-850 text-text-mid hover:border-ink-600 hover:text-text-hi',
            )}
          >
            {t.label}
            <span className="ml-2 text-xs opacity-70">{titlesByStatus(t.status).length}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-card border border-ink-800 bg-ink-900 p-4">
        <label className="flex h-11 min-w-[200px] flex-1 items-center gap-2 rounded-control border border-ink-700 bg-ink-850 px-4">
          <Search size={16} className="text-text-low" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this list"
            className="w-full bg-transparent text-sm outline-none placeholder:text-text-low"
          />
        </label>
        <Select value={type} onChange={(v) => setType(v as typeof type)}>
          <option value="all">All types</option>
          <option value="movie">Movies</option>
          <option value="series">Series</option>
        </Select>
        <Select value={genre} onChange={setGenre}>
          <option value="all">All genres</option>
          {CANONICAL_GENRES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <Select value={decade} onChange={setDecade}>
          <option value="all">All decades</option>
          {decades.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Select value={prefs.librarySort} onChange={(v) => setPrefs({ librarySort: v as SortKey })}>
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              Sort: {s.label}
            </option>
          ))}
        </Select>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<LibraryIcon size={22} />}
          title="Nothing here yet"
          body="Sort a few titles on the Remember tab and they will land in this list straight away."
        />
      ) : prefs.libraryView === 'grid' ? (
        /* Column count is driven by the status row inside each card: five
           controls need roughly 260px of card to stay tappable, so the grid
           widens a step at a time rather than jumping straight to three. */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((t) => (
            <PosterCard
              key={t.id}
              title={t}
              status={statusOf(t.id)}
              onSet={(s) => setStatusById(t.id, s)}
              onReset={() => resetStatus(t.id)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((t) => (
            <TitleRow
              key={t.id}
              title={t}
              status={statusOf(t.id)}
              onSet={(s) => setStatusById(t.id, s)}
              onReset={() => resetStatus(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 cursor-pointer rounded-control border border-ink-700 bg-ink-850 px-3 text-sm font-medium text-text-mid transition-colors hover:border-ink-600 hover:text-text-hi"
    >
      {children}
    </select>
  )
}
