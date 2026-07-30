import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { TitleRow } from '../components/TitleItem'
import { Button, EmptyState } from '../components/ui'
import { localProvider, type Recommendation } from '../data/provider'
import { useStore } from '../store'

export function ForYou({ onStart }: { onStart: () => void }) {
  const { profile, statuses, statusOf, setStatus, resetStatus, watchedCount } = useStore()
  const [recs, setRecs] = useState<Recommendation[]>([])

  useEffect(() => {
    // Anything already resolved (watched, not watched, watchlist, unsure) is excluded.
    const exclude = new Set(Object.keys(statuses))
    let cancelled = false
    localProvider.getRecommendations(profile, exclude).then((r) => {
      if (!cancelled) setRecs(r)
    })
    return () => {
      cancelled = true
    }
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
      ) : recs.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={22} />}
          title="You have sorted the whole catalogue"
          body="There is nothing left in this prototype's local catalogue to recommend."
        />
      ) : (
        <div className="space-y-3">
          {recs.map((r) => (
            <TitleRow
              key={r.title.id}
              title={r.title}
              status={statusOf(r.title.id)}
              reasons={r.reasons}
              onSet={(s) => setStatus(r.title.id, s)}
              onReset={() => resetStatus(r.title.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
