import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { getCalibrationProbes } from '../data/calibration'
import { fitViewer } from '../data/viewer'
import type { CalibrationAnswer, Title, Viewer } from '../types'
import { Poster } from './Poster'
import { cx } from './ui'

/**
 * The calibration round.
 *
 * A short, fixed set of probes answered watched / not watched, used to fit the
 * viewer before the real deck starts. Two deliberate choices:
 *
 *   - answers are handed back to the caller so they can be recorded as genuine
 *     classifications, not thrown away as quiz input. The user never judges the
 *     same title twice.
 *   - the round is always skippable, and any failure to load probes skips it
 *     silently. Calibration improves the deck; it must never gate reaching it.
 */
export function CalibrationRound({
  onDone,
  onSkip,
}: {
  onDone: (viewer: Viewer, answers: CalibrationAnswer[]) => void
  onSkip: () => void
}) {
  const [probes, setProbes] = useState<Title[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [index, setIndex] = useState(0)
  const answers = useRef<CalibrationAnswer[]>([])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    getCalibrationProbes(controller.signal)
      .then((p) => {
        if (cancelled) return
        if (p.length < 4) setFailed(true)
        else setProbes(p)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  // Nothing usable to calibrate with — move on rather than stranding the user.
  useEffect(() => {
    if (failed) onSkip()
  }, [failed, onSkip])

  if (!probes) {
    return (
      <Frame>
        <div className="flex flex-col items-center gap-4 py-20 text-text-mid">
          <Loader2 size={22} className="animate-spin" />
          <p className="text-sm">Picking a few titles to calibrate with…</p>
        </div>
      </Frame>
    )
  }

  const current = probes[index]
  const total = probes.length

  function answer(watched: boolean | null) {
    answers.current.push({ title: current, watched })
    if (index + 1 >= total) onDone(fitViewer(answers.current), answers.current)
    else setIndex(index + 1)
  }

  return (
    <Frame>
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">Have you seen these?</h1>
        <p className="text-text-mid">
          A few well-known titles, so the deck can work out which eras and languages to show you.
          Answer honestly — “no” is just as useful as “yes”.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-medium text-text-low">
          <span>
            {index + 1} of {total}
          </span>
          <button onClick={onSkip} className="underline underline-offset-2 hover:text-text-hi">
            Skip calibration
          </button>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${(index / total) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-5 rounded-card border border-ink-800 bg-ink-900 p-5">
        <Poster title={current} className="h-[168px] w-28 shrink-0 rounded-lg" />
        <div className="min-w-0 space-y-1.5">
          <h2 className="text-xl font-bold leading-tight">{current.title}</h2>
          <p className="text-sm text-text-low">
            {[current.year || null, current.type === 'movie' ? 'Movie' : 'Series']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ProbeButton
          onClick={() => answer(false)}
          className="border-skip/40 text-skip hover:bg-skip/15 active:bg-skip/30"
        >
          <X size={20} /> Not seen it
        </ProbeButton>
        <ProbeButton
          onClick={() => answer(true)}
          className="border-watched/40 text-watched hover:bg-watched/15 active:bg-watched/30"
        >
          <Check size={20} /> Seen it
        </ProbeButton>
      </div>

      <button
        onClick={() => answer(null)}
        className="mx-auto text-sm text-text-low underline underline-offset-2 hover:text-text-hi"
      >
        Not sure — skip this one
      </button>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-8 px-6 py-12">
      {children}
    </div>
  )
}

function ProbeButton({
  onClick,
  className,
  children,
}: {
  onClick: () => void
  className: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex h-14 items-center justify-center gap-2 rounded-control border bg-ink-900 text-sm font-semibold transition-colors',
        className,
      )}
    >
      {children}
    </button>
  )
}
