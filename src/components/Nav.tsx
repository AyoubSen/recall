import { Layers, Search, Sparkles, User, Clapperboard } from 'lucide-react'
import { cx } from './ui'

export type Route = 'remember' | 'library' | 'foryou' | 'profile'

const ITEMS: { route: Route; label: string; icon: typeof Layers }[] = [
  { route: 'remember', label: 'Remember', icon: Clapperboard },
  { route: 'library', label: 'Library', icon: Layers },
  { route: 'foryou', label: 'For You', icon: Sparkles },
  { route: 'profile', label: 'Profile', icon: User },
]

export function TopNav({
  route,
  onNavigate,
  onSearch,
  watchedCount,
}: {
  route: Route
  onNavigate: (r: Route) => void
  onSearch: () => void
  watchedCount: number
}) {
  return (
    <header className="sticky top-0 z-30 hidden border-b border-ink-800 bg-ink-950/90 backdrop-blur md:block">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-8 px-6">
        <span className="text-lg font-bold tracking-tight">
          Reel<span className="text-accent">Dex</span>
        </span>

        <nav className="flex items-center gap-1">
          {ITEMS.map(({ route: r, label, icon: Icon }) => (
            <button
              key={r}
              onClick={() => onNavigate(r)}
              aria-current={route === r ? 'page' : undefined}
              className={cx(
                'inline-flex h-10 items-center gap-2 rounded-control px-4 text-sm font-semibold transition-colors',
                route === r
                  ? 'bg-ink-800 text-text-hi'
                  : 'text-text-low hover:bg-ink-850 hover:text-text-hi',
              )}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="rounded-full border border-ink-700 px-3 py-1.5 text-xs font-semibold text-text-mid">
            {watchedCount} remembered
          </span>
          <button
            onClick={onSearch}
            className="inline-flex h-10 items-center gap-2 rounded-control border border-ink-700 bg-ink-850 px-4 text-sm font-medium text-text-mid transition-colors hover:border-ink-600 hover:text-text-hi"
          >
            <Search size={16} />
            Search
          </button>
        </div>
      </div>
    </header>
  )
}

export function BottomNav({
  route,
  onNavigate,
  onSearch,
}: {
  route: Route
  onNavigate: (r: Route) => void
  onSearch: () => void
}) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-ink-800 bg-ink-950/95 backdrop-blur md:hidden">
      <div className="flex h-[64px] items-stretch">
        {ITEMS.map(({ route: r, label, icon: Icon }) => (
          <button
            key={r}
            onClick={() => onNavigate(r)}
            aria-current={route === r ? 'page' : undefined}
            className={cx(
              'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
              route === r ? 'text-accent' : 'text-text-low active:text-text-hi',
            )}
          >
            <Icon size={20} />
            {label}
          </button>
        ))}
        <button
          onClick={onSearch}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-text-low active:text-text-hi"
        >
          <Search size={20} />
          Search
        </button>
      </div>
    </nav>
  )
}
