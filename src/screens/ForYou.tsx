import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { TitleRow } from '../components/TitleItem'
import { Button, EmptyState } from '../components/ui'
import { catalogProvider, type Recommendation } from '../data/provider'
import { useStore } from '../store'

export function ForYou({ onStart }: { onStart: () => void }) {
  const { profile, statuses, statusOf, setStatus, resetStatus, watchedCount, knownTitles } =
    useStore()
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Anything already resolved (watched, not watched, watchlist, unsure) is excluded.
    const exclude = new Set(Object.keys(statuses))
    const controller = new AbortController()
    let cancelled = false
    setLoading(true)
    catalogProvider
      .getRecommendations(profile, exclude, knownTitles, controller.signal)
      .then((r) => {
        if (!cancelled) setRecs(r)
      })
      .catch(() => {
        if (!cancelled) setRecs([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
    // knownTitles is only used for genre weighting; recompute on status change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, statuses])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 py-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">For you</h1>
        <p className="text-text-mid">
          Scored from the genres, decades, people and ratings in your watched library. Nothing you
          have already sorted appears here.
        </p>
      </div>

      {watchedCount === 0 ? (
        <EmptyState
          icon={<Sparkles size={22} />}
          title="Nothing to go on yet"
          body="Recommendations are built from what you have marked as watched. Sort a few titles first."
          action={
            <Button variant="primary" onClick={onStart}>
              Start remembering
            </Button>
          }
        />
      ) : loading && recs.length === 0 ? (
        <EmptyState
          icon={<Loader2 size={22} className="animate-spin" />}
          title="Building your recommendations"
          body="Looking at what the titles you have watched are related to."
        />
      ) : recs.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={22} />}
          title="No recommendations yet"
          body="Nothing new came back for the titles you have watched so far. Sort a few more and check again."
        />
      ) : (
        <div className="space-y-3">
          {recs.map((r) => (
            <TitleRow
              key={r.title.id}
              title={r.title}
              status={statusOf(r.title.id)}
              reasons={r.reasons}
              onSet={(s) => setStatus(r.title, s)}
              onReset={() => resetStatus(r.title.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
