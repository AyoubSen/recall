import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { validateBackup, type BackupFile, type BackupSummary, type ImportMode } from '../data/backup'
import { useStore } from '../store'
import { Button, Dialog, Panel, SectionTitle } from './ui'

/** Export / import of the user's own data. Deliberately plain and low-key. */
export function BackupControls() {
  const { exportData, importBackup, statuses, storageBytes } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const [pending, setPending] = useState<{ backup: BackupFile; summary: BackupSummary } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setDone(null)

    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
      setError('Please choose a .json backup file.')
      return
    }

    const text = await file.text()
    const result = validateBackup(text)
    // Nothing is written until the summary below is confirmed.
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPending({ backup: result.backup, summary: result.summary })
  }

  function confirm(mode: ImportMode) {
    if (!pending) return
    importBackup(pending.backup, mode)
    setDone(
      mode === 'replace'
        ? 'Backup restored. Your previous local data was replaced.'
        : 'Backup merged into your current data.',
    )
    setPending(null)
  }

  const classified = Object.keys(statuses).length

  return (
    <Panel>
      <SectionTitle hint={`${classified} classified · ${(storageBytes / 1024).toFixed(0)} KB stored`}>
        Backup
      </SectionTitle>

      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Export data</span>
            <span className="block text-sm text-text-low">
              Downloads everything ReelDeck stores about you as a JSON file. No tokens are included.
            </span>
          </span>
          <Button icon={<Download size={16} />} onClick={exportData}>
            Export
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink-800 pt-5">
          <span>
            <span className="block text-sm font-medium">Import data</span>
            <span className="block text-sm text-text-low">
              Restore a backup. You will see what is in the file before anything changes.
            </span>
          </span>
          <Button icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              // Allow re-selecting the same file after a failed attempt.
              e.target.value = ''
            }}
          />
        </div>

        {error && (
          <p className="rounded-control border border-skip/30 bg-skip/10 px-4 py-3 text-sm text-skip">
            {error}
          </p>
        )}
        {done && (
          <p className="rounded-control border border-watched/30 bg-watched/10 px-4 py-3 text-sm text-watched">
            {done}
          </p>
        )}
      </div>

      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        title="Restore this backup?"
        footer={
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setPending(null)}>Cancel</Button>
            <Button onClick={() => confirm('merge')}>Merge</Button>
            <Button variant="primary" onClick={() => confirm('replace')}>
              Replace everything
            </Button>
          </div>
        }
      >
        {pending && (
          <div className="space-y-5">
            <dl className="space-y-2 text-sm">
              <Row label="Exported" value={formatDate(pending.summary.exportedAt)} />
              <Row label="Watched" value={pending.summary.watched} />
              <Row label="Never watched" value={pending.summary.not_watched} />
              <Row label="Watchlist" value={pending.summary.watchlist} />
              <Row label="Not sure" value={pending.summary.unsure} />
              <Row label="Titles with metadata" value={pending.summary.titles} />
              <Row label="History entries" value={pending.summary.historyEntries} />
            </dl>
            <div className="space-y-2 text-sm text-text-mid">
              <p>
                <strong className="text-text-hi">Merge</strong> keeps both sets. Where the same
                title is classified differently, the more recent classification wins.
              </p>
              <p>
                <strong className="text-text-hi">Replace everything</strong> discards your current
                local data — {classified} classified {classified === 1 ? 'title' : 'titles'} — and
                uses only this file.
              </p>
            </div>
          </div>
        )}
      </Dialog>
    </Panel>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-ink-800 pb-2">
      <dt className="text-text-mid">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Unknown'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString()
}
