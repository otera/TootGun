import { useState } from 'react'
import type { MastodonAccount } from '../types'

interface SettingsProps {
  onSaved: (account: MastodonAccount) => void
}

interface StatusMsg {
  type: 'success' | 'error'
  text: string
}

export default function Settings({ onSaved }: SettingsProps) {
  const [serverUrl, setServerUrl] = useState('https://mastodon.social')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<StatusMsg | null>(null)
  const [loading, setLoading] = useState(false)

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setStatus(null)

    const cleanUrl = serverUrl.replace(/\/$/, '')

    try {
      const account = await window.api.mastodon.verify({ serverUrl: cleanUrl, token })
      await window.api.store.set('serverUrl', cleanUrl)
      await window.api.store.set('token', token)
      setStatus({ type: 'success', text: `接続成功: @${account.acct}` })
      setTimeout(() => onSaved(account), 800)
    } catch (err) {
      setStatus({ type: 'error', text: `接続失敗: ${(err as Error).message}` })
    } finally {
      setLoading(false)
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

      <form className="settings-form" onSubmit={handleConnect}>
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

        <div className="form-group">
          <label>アクセストークン</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="トークンを貼り付け"
            required
          />
          <span className="form-hint">
            設定 → 開発 → 新規アプリ作成時に
            <br />
            <code>read:accounts</code> と <code>write:statuses</code> を付与してコピー
          </span>
        </div>

        {status && <div className={`status-msg ${status.type}`}>{status.text}</div>}

        <button type="submit" className="connect-btn" disabled={loading}>
          {loading ? '接続中...' : '接続する'}
        </button>
      </form>
    </div>
  )
}
