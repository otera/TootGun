import { useState, useEffect } from 'react'
import iconPng from './assets/icon.png'
import Composer from './components/Composer'
import Settings from './components/Settings'
import type { MastodonAccount } from './types'

type Screen = 'loading' | 'settings' | 'composer'

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [account, setAccount] = useState<MastodonAccount | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const acct = await window.api.mastodon.verify()
        setAccount(acct)
        setScreen('composer')
      } catch {
        setScreen('settings')
      }
    }
    init()
  }, [])

  const handleSettingsSaved = (acct: MastodonAccount) => {
    setAccount(acct)
    setScreen('composer')
  }

  const handleLogout = async () => {
    await window.api.store.delete('serverUrl')
    await window.api.store.delete('token')
    setAccount(null)
    setScreen('settings')
  }

  if (screen === 'loading') {
    return (
      <div className="loading-screen">
        <img className="loading-gun" src={iconPng} alt="TootGun" />
      </div>
    )
  }

  if (screen === 'settings') {
    return <Settings onSaved={handleSettingsSaved} />
  }

  return <Composer account={account!} onLogout={handleLogout} />
}
