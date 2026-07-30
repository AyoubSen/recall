import { useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUp, Search, Sparkles } from 'lucide-react'
import { FiltersForm } from '../components/FiltersDialog'
import { Button } from '../components/ui'
import { DEFAULT_FILTERS, useStore } from '../store'
import type { Filters } from '../types'

const RULES = [
  { icon: ArrowRight, color: 'text-watched', title: 'Swipe right', body: 'You have watched it.' },
  { icon: ArrowLeft, color: 'text-skip', title: 'Swipe left', body: 'You have never watched it.' },
  { icon: ArrowUp, color: 'text-later', title: 'Swipe up', body: 'Save it to your watchlist.' },
  { icon: Search, color: 'text-accent', title: 'Or search', body: 'Look titles up manually any time.' },
]

export function Onboarding() {
  const { completeOnboarding } = useStore()
  const [step, setStep] = useState<'intro' | 'setup'>('intro')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  if (step === 'intro') {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-10 px-6 py-16">
        <div className="space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-ink-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
            <Sparkles size={14} /> Prototype
          </span>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            Remember everything you have ever watched.
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-text-mid">
            Rebuilding your viewing history one search at a time is exhausting. Recall shows you
            titles you might recognise, one at a time, and you just react.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {RULES.map(({ icon: Icon, color, title, body }) => (
            <div
              key={title}
              className="flex items-start gap-4 rounded-card border border-ink-800 bg-ink-900 p-5"
            >
              <span className={`mt-0.5 ${color}`}>
                <Icon size={22} />
              </span>
              <div className="space-y-1">
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-text-mid">{body}</p>
              </div>
            </div>
          ))}
        </div>

        <Button variant="primary" size="lg" fullWidth onClick={() => setStep('setup')}>
          Start remembering
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">Shape your deck</h1>
        <p className="text-text-mid">
          Optional — you can change all of this later from the deck. Anything you leave untouched
          means “show me everything”.
        </p>
      </div>

      <FiltersForm value={filters} onChange={setFilters} />

      <div className="mt-4 flex gap-3 border-t border-ink-800 pt-8">
        <Button variant="ghost" size="lg" onClick={() => setStep('intro')}>
          Back
        </Button>
        <Button variant="primary" fullWidth size="lg" onClick={() => completeOnboarding(filters)}>
          Start swiping
        </Button>
      </div>
    </div>
  )
}
