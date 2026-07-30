import { useEffect, useState } from 'react'
import { BottomNav, TopNav, type Route } from './components/Nav'
import { SearchOverlay } from './components/SearchOverlay'
import { Deck } from './screens/Deck'
import { ForYou } from './screens/ForYou'
import { Library } from './screens/Library'
import { Onboarding } from './screens/Onboarding'
import { Profile } from './screens/Profile'
import { StoreProvider, useStore } from './store'

function Shell() {
  const { onboarded, watchedCount } = useStore()
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

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
