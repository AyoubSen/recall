import { Bookmark, Check, HelpCircle, RotateCcw, X } from 'lucide-react'
import type { Title, TitleStatus } from '../types'
import { Poster } from './Poster'
import { StatusChip, cx } from './ui'

const ACTIONS: { status: TitleStatus; label: string; icon: typeof Check; active: string }[] = [
  { status: 'watched', label: 'Watched', icon: Check, active: 'border-watched bg-watched/15 text-watched' },
  { status: 'watchlist', label: 'Watchlist', icon: Bookmark, active: 'border-later bg-later/15 text-later' },
  { status: 'unsure', label: 'Not sure', icon: HelpCircle, active: 'border-accent bg-accent/15 text-accent' },
  { status: 'not_watched', label: 'Not watched', icon: X, active: 'border-skip bg-skip/15 text-skip' },
]

export function StatusActions({
  current,
  onSet,
  onReset,
  compact,
}: {
  current: TitleStatus
  onSet: (s: TitleStatus) => void
  onReset?: () => void
  /** Icon-only, single row — for narrow containers like grid poster cards. */
  compact?: boolean
}) {
  return (
    <div className={cx('flex items-center', compact ? 'gap-1' : 'flex-wrap gap-2')}>
      {ACTIONS.map(({ status, label, icon: Icon, active }) => (
        <button
          key={status}
          type="button"
          aria-pressed={current === status}
          aria-label={label}
          onClick={() => onSet(status)}
          title={label}
          className={cx(
            'inline-flex items-center justify-center rounded-control border font-semibold transition-colors',
            compact ? 'h-9 flex-1' : 'h-10 gap-2 px-3 text-xs',
            current === status
              ? active
              : 'border-ink-700 bg-ink-850 text-text-low hover:border-ink-600 hover:text-text-hi active:bg-ink-700',
          )}
        >
          <Icon size={15} />
          {!compact && <span className="hidden sm:inline">{label}</span>}
        </button>
      ))}
      {onReset && current !== 'unresolved' && (
        <button
          type="button"
          onClick={onReset}
          aria-label="Remove from library"
          title="Remove from library"
          className={cx(
            'inline-flex items-center justify-center rounded-control border border-ink-700 bg-ink-850 text-text-low transition-colors hover:border-ink-600 hover:text-text-hi active:bg-ink-700',
            compact ? 'h-9 w-9 shrink-0' : 'h-10 w-10',
          )}
        >
          <RotateCcw size={15} />
        </button>
      )}
    </div>
  )
}

export function PosterCard({
  title,
  status,
  onSet,
  onReset,
}: {
  title: Title
  status: TitleStatus
  onSet: (s: TitleStatus) => void
  onReset?: () => void
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-card border border-ink-800 bg-ink-900 transition-colors hover:border-ink-600">
      <Poster title={title} className="aspect-[2/3] w-full" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">{title.title}</h3>
          <p className="text-xs text-text-low">
            {[
              title.year || 'Year unknown',
              title.type === 'movie' ? 'Movie' : 'Series',
              title.rating > 0 ? `★ ${title.rating.toFixed(1)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="mt-auto">
          <StatusActions current={status} onSet={onSet} onReset={onReset} compact />
        </div>
      </div>
    </article>
  )
}

export function TitleRow({
  title,
  status,
  onSet,
  onReset,
  reasons,
}: {
  title: Title
  status: TitleStatus
  onSet: (s: TitleStatus) => void
  onReset?: () => void
  reasons?: string[]
}) {
  return (
    <article className="flex flex-wrap items-center gap-4 rounded-card border border-ink-800 bg-ink-900 p-4 transition-colors hover:border-ink-600">
      <Poster title={title} className="h-[84px] w-14 shrink-0 rounded-lg" />
      <div className="min-w-[200px] flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-[15px] font-semibold">{title.title}</h3>
          <StatusChip status={status} />
        </div>
        <p className="text-xs text-text-low">
          {[
            title.year || 'Year unknown',
            title.type === 'movie' ? 'Movie' : 'Series',
            title.genres.slice(0, 2).join(', ') || null,
            title.rating > 0 ? `★ ${title.rating.toFixed(1)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {reasons?.length ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {reasons.map((r) => (
              <span
                key={r}
                className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent"
              >
                {r}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="shrink-0">
        <StatusActions current={status} onSet={onSet} onReset={onReset} />
      </div>
    </article>
  )
}
