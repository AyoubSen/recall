import { useState } from 'react'
import { ChevronDown, Clapperboard, Clock, FlaskConical, Star, Tv, User } from 'lucide-react'
import { BackupControls } from '../components/BackupControls'
import { Button, Dialog, EmptyState, Panel, SectionTitle, cx } from '../components/ui'
import { useStore } from '../store'

export function Profile({ onStart }: { onStart: () => void }) {
  const { profile, watchedCount, prefs, setPrefs, titlesByStatus } = useStore()

  const hours = Math.round(profile.totalRuntimeMinutes / 60)
  const maxGenre = profile.genres[0]?.count ?? 1
  const maxDecade = profile.decades[0]?.count ?? 1

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 px-5 py-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Your taste profile</h1>
        <p className="text-text-mid">Calculated from the {watchedCount} titles you marked watched.</p>
      </div>

      {watchedCount === 0 ? (
        <EmptyState
          icon={<User size={22} />}
          title="No profile yet"
          body="Mark a handful of titles as watched and your genres, decades and habits will appear here."
          action={
            <Button variant="primary" onClick={onStart}>
              Start remembering
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat icon={<Clapperboard size={18} />} label="Movies watched" value={profile.moviesWatched} />
            <Stat icon={<Tv size={18} />} label="Series watched" value={profile.seriesWatched} />
            <Stat
              icon={<Star size={18} />}
              label="Average rating"
              value={profile.averageRating.toFixed(1)}
            />
            <Stat icon={<Clock size={18} />} label="Estimated hours" value={hours} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <SectionTitle hint={`${profile.genres.length} genres`}>Favourite genres</SectionTitle>
              <div className="space-y-4">
                {profile.genres.slice(0, 6).map((g) => (
                  <Bar key={g.name} label={g.name} value={g.count} max={maxGenre} />
                ))}
              </div>
            </Panel>

            <Panel>
              <SectionTitle>Favourite decades</SectionTitle>
              <div className="space-y-4">
                {profile.decades.slice(0, 6).map((d) => (
                  <Bar key={d.decade} label={d.decade} value={d.count} max={maxDecade} />
                ))}
              </div>
            </Panel>
          </div>

          <Panel>
            <SectionTitle hint="Appearing more than once in your watched list">
              People you keep watching
            </SectionTitle>
            {profile.people.length === 0 ? (
              <p className="text-sm text-text-mid">
                No repeat directors or actors yet — sort a few more titles.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2.5">
                {profile.people.slice(0, 12).map((p) => (
                  <span
                    key={p.name}
                    className="inline-flex h-10 items-center gap-2 rounded-control border border-ink-700 bg-ink-850 px-4 text-sm"
                  >
                    {p.name}
                    <span className="text-xs font-semibold text-accent">{p.count}</span>
                  </span>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      <Panel>
        <SectionTitle>Settings</SectionTitle>
        <div className="space-y-5">
          <label className="flex items-center justify-between gap-6">
            <span>
              <span className="block font-medium">Show “Never watched” in the library</span>
              <span className="block text-sm text-text-mid">
                {titlesByStatus('not_watched').length} titles are currently hidden behind this.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.showNotWatched}
              onClick={() => setPrefs({ showNotWatched: !prefs.showNotWatched })}
              className={cx(
                'relative h-7 w-12 shrink-0 rounded-full transition-colors',
                prefs.showNotWatched ? 'bg-accent' : 'bg-ink-700',
              )}
            >
              <span
                className={cx(
                  'absolute top-1 h-5 w-5 rounded-full bg-ink-950 transition-all',
                  prefs.showNotWatched ? 'left-6' : 'left-1',
                )}
              />
            </button>
          </label>

        </div>
      </Panel>

      <BackupControls />

      <TestControls />
    </div>
  )
}

/** Unobtrusive prototype-testing helpers. Collapsed by default. */
function TestControls() {
  const { resetOnboarding, resetStatuses, resetAll, seedSampleHistory } = useStore()
  const [confirming, setConfirming] = useState<null | {
    label: string
    body: string
    run: () => void
  }>(null)

  const ask = (label: string, body: string, run: () => void) => setConfirming({ label, body, run })

  return (
    <details className="group rounded-card border border-ink-800 bg-ink-900/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-sm font-medium text-text-low transition-colors hover:text-text-hi">
        <span className="inline-flex items-center gap-2">
          <FlaskConical size={16} />
          Prototype test data
        </span>
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
      </summary>

      <div className="space-y-3 border-t border-ink-800 px-6 py-5">
        <Row
          label="Populate sample history"
          body="Deterministic set of statuses across the catalogue, for trying Profile and For You."
          action={
            <Button
              onClick={() =>
                ask(
                  'Populate sample history',
                  'This replaces every status you currently have with a fixed sample set.',
                  seedSampleHistory,
                )
              }
            >
              Populate
            </Button>
          }
        />
        <Row
          label="Reset onboarding only"
          body="Statuses are kept; the intro and setup run again."
          action={<Button onClick={resetOnboarding}>Reset</Button>}
        />
        <Row
          label="Reset statuses and history"
          body="Empties the library and returns every title to the deck. Filters are kept."
          action={
            <Button
              variant="danger"
              onClick={() =>
                ask(
                  'Reset statuses and history',
                  'Every watched, watchlist, not sure and never watched mark will be deleted.',
                  resetStatuses,
                )
              }
            >
              Reset
            </Button>
          }
        />
        <Row
          label="Reset entire local state"
          body="Statuses, history, filters, preferences and onboarding."
          action={
            <Button
              variant="danger"
              onClick={() =>
                ask(
                  'Reset entire local state',
                  'Everything Recall has stored in this browser will be deleted.',
                  resetAll,
                )
              }
            >
              Reset all
            </Button>
          }
        />
      </div>

      <Dialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={confirming?.label ?? ''}
        footer={
          <div className="flex gap-3">
            <Button fullWidth onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                confirming?.run()
                setConfirming(null)
              }}
            >
              Yes, do it
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-text-mid">{confirming?.body}</p>
          <p className="rounded-control border border-skip/30 bg-skip/10 px-4 py-3 text-sm text-skip">
            This permanently deletes local data in this browser and cannot be undone. Recall has no
            account and no server copy — if you want to keep this history, close this dialog and use
            <strong className="font-semibold"> Export data</strong> first.
          </p>
        </div>
      </Dialog>
    </details>
  )
}

function Row({
  label,
  body,
  action,
}: {
  label: string
  body: string
  action: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-sm text-text-low">{body}</span>
      </span>
      <span className="shrink-0">{action}</span>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-card border border-ink-800 bg-ink-900 p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-control bg-ink-800 text-accent">
        {icon}
      </div>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-text-mid">{label}</p>
    </div>
  )
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-text-low">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(6, (value / max) * 100)}%` }}
        />
      </div>
    </div>
  )
}
