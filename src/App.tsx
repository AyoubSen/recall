import { useEffect, useState } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import { BottomNav, TopNav, type Route } from './components/Nav'
import { Button } from './components/ui'
import { SearchOverlay } from './components/SearchOverlay'
import { Deck } from './screens/Deck'
import { ForYou } from './screens/ForYou'
import { Library } from './screens/Library'
import { Onboarding } from './screens/Onboarding'
import { Profile } from './screens/Profile'
import { StoreProvider, useStore } from './store'

function Shell() {
  const { onboarded, watchedCount, storageError, exportData } = useStore()
  const [route, setRoute] = useState<Route>('remember')
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!onboarded) return <Onboarding />

  return (
    <div className="pb-nav min-h-full md:pb-0">
      <TopNav
        route={route}
        onNavigate={setRoute}
        onSearch={() => setSearchOpen(true)}
        watchedCount={watchedCount}
      />

      {storageError && <StorageWarning message={storageError} onExport={exportData} />}

      <main>
        {route === 'remember' && <Deck onOpenLibrary={() => setRoute('library')} />}
        {route === 'library' && <Library />}
        {route === 'foryou' && <ForYou onStart={() => setRoute('remember')} />}
        {route === 'profile' && <Profile onStart={() => setRoute('remember')} />}
      </main>

      <BottomNav route={route} onNavigate={setRoute} onSearch={() => setSearchOpen(true)} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}

/**
 * Persistent, non-dismissable while saving is broken. It states plainly that
 * the latest change may not survive a reload and offers the one action that
 * actually rescues the data.
 */
function StorageWarning({ message, onExport }: { message: string; onExport: () => void }) {
  return (
    <div role="alert" className="border-b border-skip/40 bg-skip/15">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-5 py-4">
        <AlertTriangle size={20} className="shrink-0 text-skip" />
        <p className="min-w-[240px] flex-1 text-sm text-text-hi">
          <strong className="font-semibold">{message}</strong> Your session still works, but changes
          since this warning appeared may not survive a reload. Export your data to keep it.
        </p>
        <Button icon={<Download size={16} />} onClick={onExport}>
          Export data
        </Button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
