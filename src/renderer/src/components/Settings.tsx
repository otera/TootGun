import { useState, useEffect } from 'react'
import type { MastodonAccount, OAuthCallbackData } from '../types'

interface SettingsProps {
  onSaved: (account: MastodonAccount) => void
}

type AuthState = 'input' | 'waiting' | 'error'

export default function Settings({ onSaved }: SettingsProps) {
  const [serverUrl, setServerUrl] = useState('https://mastodon.social')
  const [authState, setAuthState] = useState<AuthState>('input')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const cleanup = window.api.mastodon.onOAuthCallback((data: OAuthCallbackData) => {
      if (data.error) {
        setErrorMsg(data.error)
        setAuthState('error')
      } else if (data.account) {
        onSaved(data.account)
      }
    })
    return cleanup
  }, [onSaved])

  const handleAuth = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    const cleanUrl = serverUrl.replace(/\/$/, '')
    setAuthState('waiting')
    try {
      await window.api.mastodon.startOAuth(cleanUrl)
    } catch (err) {
      setErrorMsg((err as Error).message)
      setAuthState('error')
    }
  }

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <div className="logo">
          <span className="logo-text">TootGun</span>
        </div>
        <p className="logo-tagline">1秒に3発、想いをブチ込め。</p>
      </div>

      {authState === 'input' && (
        <form className="settings-form" onSubmit={handleAuth}>
          <div className="form-group">
            <label>Mastodonサーバー</label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://mastodon.social"
              required
            />
            <span className="form-hint">あなたのインスタンスのURLを入力</span>
          </div>

          <button type="submit" className="connect-btn">
            Mastodonで認証
          </button>
        </form>
      )}

      {authState === 'waiting' && (
        <div className="oauth-waiting">
          <div className="oauth-spinner" />
          <p className="oauth-waiting-text">ブラウザで認証中...</p>
          <p className="form-hint">ブラウザでTootGunへのアクセスを許可してください</p>
          <button className="cancel-btn" onClick={() => setAuthState('input')}>
            キャンセル
          </button>
        </div>
      )}

      {authState === 'error' && (
        <div className="settings-form">
          <div className="status-msg error">{errorMsg}</div>
          <button className="connect-btn" onClick={() => setAuthState('input')}>
            やり直す
          </button>
        </div>
      )}
    </div>
  )
}
