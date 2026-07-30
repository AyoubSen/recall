import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { TitleStatus } from '../types'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

/* ------------------------------------------------------------------ button */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-ink-950 hover:bg-[#ffc94d] active:bg-[#dfa41c]',
  secondary: 'bg-ink-800 text-text-hi hover:bg-ink-700 active:bg-ink-600 border border-ink-700',
  ghost: 'bg-transparent text-text-mid hover:bg-ink-800 hover:text-text-hi active:bg-ink-700',
  danger: 'bg-skip/15 text-skip hover:bg-skip/25 border border-skip/30',
}

const SIZES: Record<Size, string> = {
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-14 px-8 text-base',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  fullWidth?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  fullWidth,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border transition-colors',
        active
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-ink-700 bg-ink-800 text-text-mid hover:bg-ink-700 hover:text-text-hi active:bg-ink-600',
        'disabled:opacity-40 disabled:pointer-events-none',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------- chip */

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'h-10 rounded-control border px-4 text-sm font-medium transition-colors',
        selected
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-ink-700 bg-ink-850 text-text-mid hover:border-ink-600 hover:text-text-hi',
      )}
    >
      {children}
    </button>
  )
}

const STATUS_STYLE: Record<Exclude<TitleStatus, 'unresolved'>, { label: string; cls: string }> = {
  watched: { label: 'Watched', cls: 'bg-watched/15 text-watched border-watched/30' },
  watchlist: { label: 'Watchlist', cls: 'bg-later/15 text-later border-later/30' },
  unsure: { label: 'Not sure', cls: 'bg-accent/15 text-accent border-accent/30' },
  not_watched: { label: 'Never watched', cls: 'bg-skip/15 text-skip border-skip/30' },
}

export function StatusChip({ status }: { status: TitleStatus }) {
  if (status === 'unresolved') return null
  const s = STATUS_STYLE[status]
  return (
    <span
      className={cx(
        'inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-xs font-semibold',
        s.cls,
      )}
    >
      {s.label}
    </span>
  )
}

export function statusLabel(status: TitleStatus) {
  return status === 'unresolved' ? 'Unseen' : STATUS_STYLE[status].label
}

/* ------------------------------------------------------------------ layout */

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <h2 className="text-xl font-bold tracking-tight">{children}</h2>
      {hint && <span className="text-sm text-text-low">{hint}</span>}
    </div>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-card border border-ink-800 bg-ink-900 p-6', className)}>
      {children}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-ink-700 bg-ink-900/50 px-8 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-800 text-text-low">
        {icon}
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-text-mid">{body}</p>
      </div>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------ dialog */

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute('disabled'))

    focusables()[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      restoreTo.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        role="presentation"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-card bg-ink-900 shadow-pop sm:rounded-card"
      >
        <header className="flex items-center justify-between border-b border-ink-800 px-6 py-5">
          <h2 className="text-lg font-bold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer && <footer className="border-t border-ink-800 px-6 py-5">{footer}</footer>}
      </div>
    </div>
  )
}
