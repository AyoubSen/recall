import { useEffect, useState } from 'react'
import { ALL_GENRES, ALL_LANGUAGES, YEAR_MAX, YEAR_MIN } from '../data/catalog'
import type { Filters, MediaType, PopularityFloor } from '../types'
import { Button, Chip, Dialog } from './ui'

const TYPE_CHOICES: { label: string; value: MediaType[] }[] = [
  { label: 'Movies', value: ['movie'] },
  { label: 'Series', value: ['series'] },
  { label: 'Both', value: ['movie', 'series'] },
]

const POPULARITY: { label: string; value: PopularityFloor }[] = [
  { label: 'Popular only', value: 'popular' },
  { label: 'Balanced', value: 'balanced' },
  { label: 'Everything', value: 'everything' },
]

export function FiltersForm({
  value,
  onChange,
}: {
  value: Filters
  onChange: (f: Filters) => void
}) {
  const toggle = (list: string[], item: string) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

  return (
    <div className="space-y-8">
      <Field label="What are you remembering?">
        <div className="flex flex-wrap gap-3">
          {TYPE_CHOICES.map((c) => (
            <Chip
              key={c.label}
              selected={value.types.length === c.value.length && c.value.every((v) => value.types.includes(v))}
              onClick={() => onChange({ ...value, types: c.value })}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Release years" hint={`${value.yearFrom} – ${value.yearTo}`}>
        <div className="space-y-4 pt-1">
          <RangeInput
            label="From"
            value={value.yearFrom}
            onChange={(v) => onChange({ ...value, yearFrom: Math.min(v, value.yearTo) })}
          />
          <RangeInput
            label="To"
            value={value.yearTo}
            onChange={(v) => onChange({ ...value, yearTo: Math.max(v, value.yearFrom) })}
          />
        </div>
      </Field>

      <Field label="Genres" hint={value.genres.length ? `${value.genres.length} selected` : 'All'}>
        <div className="flex flex-wrap gap-2.5">
          {ALL_GENRES.map((g) => (
            <Chip
              key={g}
              selected={value.genres.includes(g)}
              onClick={() => onChange({ ...value, genres: toggle(value.genres, g) })}
            >
              {g}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Languages" hint={value.languages.length ? `${value.languages.length} selected` : 'All'}>
        <div className="flex flex-wrap gap-2.5">
          {ALL_LANGUAGES.map((l) => (
            <Chip
              key={l}
              selected={value.languages.includes(l)}
              onClick={() => onChange({ ...value, languages: toggle(value.languages, l) })}
            >
              {l}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Minimum popularity">
        <div className="flex flex-wrap gap-3">
          {POPULARITY.map((p) => (
            <Chip
              key={p.value}
              selected={value.popularity === p.value}
              onClick={() => onChange({ ...value, popularity: p.value })}
            >
              {p.label}
            </Chip>
          ))}
        </div>
      </Field>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-low">{label}</h3>
        {hint && <span className="text-sm text-text-mid">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function RangeInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-4">
      <span className="w-12 text-sm text-text-mid">{label}</span>
      <input
        type="range"
        min={YEAR_MIN}
        max={YEAR_MAX}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-accent"
      />
      <span className="w-12 text-right text-sm font-semibold tabular-nums">{value}</span>
    </label>
  )
}

export function FiltersDialog({
  open,
  onClose,
  value,
  onApply,
}: {
  open: boolean
  onClose: () => void
  value: Filters
  onApply: (f: Filters) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Deck filters"
      footer={
        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={() =>
              setDraft({
                types: ['movie', 'series'],
                yearFrom: YEAR_MIN,
                yearTo: YEAR_MAX,
                genres: [],
                languages: [],
                popularity: 'balanced',
              })
            }
          >
            Reset
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              onApply(draft)
              onClose()
            }}
          >
            Apply filters
          </Button>
        </div>
      }
    >
      <FiltersForm value={draft} onChange={setDraft} />
    </Dialog>
  )
}
