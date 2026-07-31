import { useRef } from 'react'
import {
  useTransform,
  motion,
  useMotionValue,
  animate,
  useReducedMotion,
  type MotionValue,
} from 'framer-motion'
import { Clock, Layers, Star } from 'lucide-react'
import type { Title, TitleStatus } from '../types'
import { Poster } from './Poster'

export type SwipeDir = 'right' | 'left' | 'up'

const DIR_STATUS: Record<SwipeDir, TitleStatus> = {
  right: 'watched',
  left: 'not_watched',
  up: 'watchlist',
}

/** Deliberate but not tiring — comfortable across a long session. */
const THRESHOLD = 96
/** A quick flick counts even if it never travels the full threshold. */
const VELOCITY_THRESHOLD = 520

function Stamp({
  text,
  color,
  className,
  opacity,
}: {
  text: string
  color: string
  className: string
  opacity: MotionValue<number>
}) {
  return (
    <motion.div
      style={{ opacity, borderColor: color, color }}
      className={`pointer-events-none absolute z-20 rounded-control border-4 px-5 py-2 text-2xl font-bold uppercase tracking-wider ${className}`}
    >
      {text}
    </motion.div>
  )
}

export function SwipeCard({
  title,
  onResolve,
}: {
  title: Title
  onResolve: (status: TitleStatus) => void
}) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const reduceMotion = useReducedMotion()
  /** Guards against a second action landing while the card is flying out. */
  const resolving = useRef(false)

  const rotate = useTransform(x, [-300, 0, 300], [-14, 0, 14])
  const watchedOp = useTransform(x, [40, 140], [0, 1])
  const notOp = useTransform(x, [-140, -40], [1, 0])
  const listOp = useTransform(y, [-140, -50], [1, 0])

  /** Animates the card out, then resolves. Only ever called from a drag. */
  function fly(dir: SwipeDir) {
    if (resolving.current) return
    resolving.current = true

    if (reduceMotion) {
      onResolve(DIR_STATUS[dir])
      return
    }

    const target =
      dir === 'right' ? { x: 700, y: 0 } : dir === 'left' ? { x: -700, y: 0 } : { x: 0, y: -820 }
    animate(x, target.x, { duration: 0.26, ease: 'easeOut' })
    animate(y, target.y, { duration: 0.26, ease: 'easeOut' })
    window.setTimeout(() => onResolve(DIR_STATUS[dir]), 165)
  }

  return (
    <motion.div
      drag={!resolving.current}
      dragElastic={0.5}
      dragMomentum={false}
      style={{ x, y, rotate }}
      onDragEnd={(_, info) => {
        if (resolving.current) return
        const { x: dx, y: dy } = info.offset
        const { x: vx, y: vy } = info.velocity

        const up = dy < -THRESHOLD || vy < -VELOCITY_THRESHOLD
        const right = dx > THRESHOLD || vx > VELOCITY_THRESHOLD
        const left = dx < -THRESHOLD || vx < -VELOCITY_THRESHOLD

        if (up && Math.abs(dy) > Math.abs(dx)) fly('up')
        else if (right && dx > 0) fly('right')
        else if (left && dx < 0) fly('left')
        else {
          animate(x, 0, { type: 'spring', stiffness: 400, damping: 34 })
          animate(y, 0, { type: 'spring', stiffness: 400, damping: 34 })
        }
      }}
      whileTap={{ cursor: 'grabbing' }}
      className="no-select absolute inset-0 cursor-grab overflow-hidden rounded-card border border-ink-700 bg-ink-900 shadow-deck"
    >
      <Stamp text="Watched" color="#3ddc97" className="left-6 top-6 -rotate-12" opacity={watchedOp} />
      <Stamp text="Not watched" color="#f2545b" className="right-6 top-6 rotate-12" opacity={notOp} />
      <Stamp
        text="Watchlist"
        color="#6ea8ff"
        className="left-1/2 top-24 -translate-x-1/2"
        opacity={listOp}
      />

      <div className="relative h-[56%] w-full">
        <Poster title={title} large className="h-full w-full" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-900 to-transparent" />
      </div>

      {/* Fixed-height metadata block: nothing below the card may shift between
          titles, however long the overview or genre list is. */}
      <div className="flex h-[44%] flex-col gap-3 p-6">
        <div className="space-y-2">
          <h2 className="line-clamp-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            {title.title}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text-mid">
            <span className="font-semibold text-text-hi">{title.year}</span>
            <span className="rounded-full border border-ink-700 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide">
              {title.type === 'movie' ? 'Movie' : 'Series'}
            </span>
            {/* Runtime and season count arrive with the lazy details request,
                so they are omitted rather than rendered as "undefined". */}
            {title.type === 'movie' && !!title.runtime && (
              <span className="inline-flex items-center gap-1.5">
                <Clock size={14} />
                {title.runtime} min
              </span>
            )}
            {title.type === 'series' && !!title.seasons && (
              <span className="inline-flex items-center gap-1.5">
                <Layers size={14} />
                {title.seasons} season{title.seasons > 1 ? 's' : ''}
              </span>
            )}
            {title.rating > 0 && (
              <span className="inline-flex items-center gap-1.5 text-accent">
                <Star size={14} fill="currentColor" />
                {title.rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        <p className="line-clamp-3 text-[15px] leading-relaxed text-text-mid">{title.overview}</p>

        <div className="mt-auto flex flex-wrap gap-2 overflow-hidden" style={{ maxHeight: 32 }}>
          {title.genres.slice(0, 3).map((g) => (
            <span
              key={g}
              className="rounded-full bg-ink-800 px-3 py-1.5 text-xs font-medium text-text-mid"
            >
              {g}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
