import { useState } from 'react'
import { Film, Tv } from 'lucide-react'
import type { Title } from '../types'
import { cx } from './ui'

/**
 * Renders the remote poster when the catalogue has one, otherwise a generated
 * cinematic poster built from the title's palette. The generated version is
 * also the error fallback, so a dead remote URL degrades silently.
 */
export function Poster({
  title,
  className,
  large,
}: {
  title: Title
  className?: string
  large?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const showRemote = title.posterUrl && !failed

  return (
    <div
      className={cx('relative overflow-hidden bg-ink-850', className)}
      style={
        showRemote
          ? undefined
          : {
              backgroundImage: `radial-gradient(120% 100% at 20% 0%, ${title.palette[0]} 0%, ${title.palette[1]} 70%)`,
            }
      }
    >
      {showRemote ? (
        large ? (
          // The deck crops a 2:3 poster into a landscape band, so show the whole
          // poster over a blurred fill of itself rather than cutting it in half.
          <>
            <img
              src={title.posterUrl}
              alt=""
              aria-hidden
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.45]"
            />
            <img
              src={title.posterUrl}
              alt={title.title}
              draggable={false}
              onError={() => setFailed(true)}
              className="pointer-events-none relative mx-auto h-full object-contain"
            />
          </>
        ) : (
          <img
            src={title.posterUrl}
            alt={title.title}
            loading="lazy"
            draggable={false}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        )
      ) : (
        <div className="flex h-full w-full flex-col justify-between p-4">
          <div className="flex items-center gap-2 text-white/45">
            {title.type === 'movie' ? <Film size={large ? 20 : 14} /> : <Tv size={large ? 20 : 14} />}
            <span className={cx('font-semibold uppercase tracking-widest', large ? 'text-xs' : 'text-[10px]')}>
              {title.type === 'movie' ? 'Film' : 'Series'}
            </span>
          </div>
          <div>
            <p
              className={cx(
                'font-bold leading-tight text-white/90',
                large ? 'text-3xl sm:text-4xl' : 'text-base',
              )}
            >
              {title.title}
            </p>
            <p className={cx('mt-1 text-white/45', large ? 'text-base' : 'text-xs')}>{title.year}</p>
          </div>
        </div>
      )}
    </div>
  )
}
