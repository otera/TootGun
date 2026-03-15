import { useState, useEffect } from 'react'
import Composer from './components/Composer'
import Settings from './components/Settings'

export default function App() {
  const [screen, setScreen] = useState('loading')
  const [account, setAccount] = useState(null)

  useEffect(() => {
    async function init() {
      const serverUrl = await window.api.store.get('serverUrl')
      const token = await window.api.store.get('token')
      if (serverUrl && token) {
        try {
          const acct = await window.api.mastodon.verify({ serverUrl, token })
          setAccount(acct)
          setScreen('composer')
        } catch {
          setScreen('settings')
        }
      } else {
        setScreen('settings')
      }
    }
    init()
  }, [])

  const handleSettingsSaved = (acct) => {
    setAccount(acct)
    setScreen('composer')
  }

  const handleLogout = () => {
    window.api.store.delete('serverUrl')
    window.api.store.delete('token')
    setAccount(null)
    setScreen('settings')
  }

  if (screen === 'loading') {
    return (
      <div className="loading-screen">
        <div className="loading-gun">🔫</div>
      </div>
    )
  }

  if (screen === 'settings') {
    return <Settings onSaved={handleSettingsSaved} />
  }

  return <Composer account={account} onLogout={handleLogout} />
}
