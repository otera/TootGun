import { useState, useEffect, useRef, useCallback } from 'react'
import HashtagPanel from './HashtagPanel'
import SparkEffect from './SparkEffect'
import type { MastodonAccount, Visibility, Spark, PostHistory } from '../types'

const MAX_CHARS = 500

/**
 * 日付を「5分前」「2時間前」「3日前」のように相対的な表現に変換。
 * 1年を超える場合は「2024/06/01 12:34:56」のように絶対日時で変換。
 * @param isoString ISO形式の日付文字列
 * @returns フォーマットされた日時文字列
 */
function formatTime(isoString: string): string {
  const now = new Date()
  const date = new Date(isoString)
  const diffMs = now.getTime() - date.getTime()

  if (diffMs >= 365 * 24 * 60 * 60 * 1000) {
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const rtf = new Intl.RelativeTimeFormat('ja', { numeric: 'auto' })
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return rtf.format(-diffSec, 'second')
  if (diffMin < 60) return rtf.format(-diffMin, 'minute')
  if (diffHour < 24) return rtf.format(-diffHour, 'hour')
  if (diffDay < 30) return rtf.format(-diffDay, 'day')
  return rtf.format(-Math.floor(diffDay / 30), 'month')
}
const MAIN_WIDTH = 400
const HISTORY_WIDTH = 280

interface ComposerProps {
  account: MastodonAccount
  onLogout: () => void
}

export default function Composer({ account, onLogout }: ComposerProps) {
  const [text, setText] = useState('')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [activeHashtags, setActiveHashtags] = useState<string[]>([])
  const [posting, setPosting] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [flash, setFlash] = useState(false)
  const [sparks, setSparks] = useState<Spark[]>([])
  const [lastPosts, setLastPosts] = useState<PostHistory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [cwEnabled, setCwEnabled] = useState(false)
  const [cwText, setCwText] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const cwInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    async function load() {
      const savedHashtags = (await window.api.store.get('hashtags')) as string[] | undefined
      const savedActive = (await window.api.store.get('activeHashtags')) as string[] | undefined
      const savedPosts = (await window.api.store.get('lastPosts')) as PostHistory[] | undefined
      const savedVisibility = (await window.api.store.get('visibility')) as Visibility | undefined
      const savedAlwaysOnTop = (await window.api.store.get('alwaysOnTop')) as boolean | undefined
      const savedHistoryOpen = (await window.api.store.get('historyOpen')) as boolean | undefined
      if (savedHashtags) setHashtags(savedHashtags)
      if (savedActive) setActiveHashtags(savedActive)
      if (savedPosts) setLastPosts(savedPosts)
      if (savedVisibility) setVisibility(savedVisibility)
      if (savedAlwaysOnTop) {
        setAlwaysOnTop(true)
        await window.api.window.setAlwaysOnTop(true)
      }
      if (savedHistoryOpen) {
        setHistoryOpen(true)
        await window.api.window.setWidth(MAIN_WIDTH + HISTORY_WIDTH)
      }
    }
    load()
    textareaRef.current?.focus()
  }, [])

  const fullText = text
    ? text + (activeHashtags.length ? '\n\n' + activeHashtags.map((t) => `#${t}`).join(' ') : '')
    : ''

  const charCount = fullText.length + (cwEnabled ? cwText.length : 0)
  const remaining = MAX_CHARS - charCount
  const canPost = text.trim().length > 0 && remaining >= 0 && !posting

  const fireEffect = useCallback(() => {
    setShaking(true)
    setTimeout(() => setShaking(false), 300)

    setFlash(true)
    setTimeout(() => setFlash(false), 120)

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const originX = rect.left + rect.width / 2
      const originY = rect.top + rect.height / 2
      const newSparks: Spark[] = Array.from({ length: 18 }, (_, i) => ({
        id: Date.now() + i,
        x: originX,
        y: originY,
        angle: (i / 18) * 360 + Math.random() * 20 - 10,
        speed: 80 + Math.random() * 120,
        size: 3 + Math.random() * 5,
        color: ['#ff6b00', '#ffcc00', '#ff3300', '#ffffff'][Math.floor(Math.random() * 4)]
      }))
      setSparks((prev) => [...prev, ...newSparks])
      setTimeout(() => {
        setSparks((prev) => prev.filter((s) => !newSparks.find((ns) => ns.id === s.id)))
      }, 700)
    }
  }, [])

  const handlePost = async () => {
    if (!canPost) return

    setPosting(true)
    setError(null)

    try {
      await window.api.mastodon.post({
        status: fullText,
        visibility,
        spoiler_text: cwEnabled ? cwText.trim() || undefined : undefined
      })
      fireEffect()

      const newPost: PostHistory = { text: fullText, time: new Date().toISOString() }
      const updatedPosts = [newPost, ...lastPosts].slice(0, 10)
      setLastPosts(updatedPosts)
      await window.api.store.set('lastPosts', updatedPosts)

      setText('')
      setCwText('')
      textareaRef.current?.focus()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPosting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handlePost()
    }
  }

  const handleHashtagsChange = async (tags: string[], active: string[]) => {
    setHashtags(tags)
    setActiveHashtags(active)
    await window.api.store.set('hashtags', tags)
    await window.api.store.set('activeHashtags', active)
  }

  const handleToggleAlwaysOnTop = async () => {
    const next = !alwaysOnTop
    setAlwaysOnTop(next)
    await window.api.window.setAlwaysOnTop(next)
    await window.api.store.set('alwaysOnTop', next)
  }

  const handleToggleHistory = async () => {
    await window.api.store.set('historyOpen', !historyOpen)
    if (!historyOpen) {
      await window.api.window.setWidth(MAIN_WIDTH + HISTORY_WIDTH)
      setHistoryOpen(true)
    } else {
      setHistoryOpen(false)
      await window.api.window.setWidth(MAIN_WIDTH)
    }
  }

  const remainingClass = remaining < 0 ? 'danger' : remaining < 30 ? 'warning' : ''

  return (
    <div
      className={`composer-screen ${shaking ? 'shake' : ''} ${alwaysOnTop ? 'always-on-top' : ''}`}
    >
      {flash && <div className="muzzle-flash" />}
      <SparkEffect sparks={sparks} />

      {/* Main area */}
      <div className="main-area">
        {/* Header */}
        <div className="composer-header">
          <div className="logo-small">
            <span className="logo-text-small">TootGun</span>
          </div>
          <div className="account-info">
            <button
              className={`hist-btn ${historyOpen ? 'active' : ''}`}
              onClick={handleToggleHistory}
              title={historyOpen ? 'ログを閉じる' : '投稿ログを開く'}
            >
              LOG
            </button>
            <button
              className={`pin-btn ${alwaysOnTop ? 'active' : ''}`}
              onClick={handleToggleAlwaysOnTop}
              title={alwaysOnTop ? '最前面固定: ON' : '最前面固定: OFF'}
            >
              📌
            </button>
            <img
              src={account.avatar}
              alt={account.display_name}
              className="avatar"
              title={`@${account.acct}`}
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
            <button className="logout-btn" onClick={onLogout} title="ログアウト">
              ⏏ ログアウト
            </button>
          </div>
        </div>

        {/* Textarea */}
        <div className="compose-area">
          {cwEnabled && (
            <input
              ref={cwInputRef}
              type="text"
              className="cw-input"
              value={cwText}
              onChange={(e) => setCwText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="注意書き（CW）"
              maxLength={500}
            />
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="今すぐブチ込め！"
            className="toot-input"
            rows={5}
          />

          {/* Visibility */}
          <div className="options-row">
            <select
              className="visibility-select"
              value={visibility}
              onChange={async (e) => {
                const v = e.target.value as Visibility
                setVisibility(v)
                await window.api.store.set('visibility', v)
              }}
            >
              <option value="public">🌍 公開</option>
              <option value="unlisted">🔓 未収載</option>
              <option value="private">🔒 フォロワーのみ</option>
              <option value="direct">✉️ ダイレクト</option>
            </select>

            <div className="options-right">
              <button
                className={`cw-toggle-btn ${cwEnabled ? 'active' : ''}`}
                onClick={() => {
                  const next = !cwEnabled
                  setCwEnabled(next)
                  if (next) {
                    setTimeout(() => cwInputRef.current?.focus(), 50)
                  } else {
                    setCwText('')
                    textareaRef.current?.focus()
                  }
                }}
                title={cwEnabled ? 'CW解除' : '注意書き（Content Warning）を追加'}
              >
                CW
              </button>
              <span className={`char-count ${remainingClass}`}>{remaining}</span>
            </div>
          </div>

          {/* Hashtag panel */}
          <HashtagPanel
            hashtags={hashtags}
            activeHashtags={activeHashtags}
            onChange={handleHashtagsChange}
          />

          {error && <div className="error-msg">{error}</div>}

          {/* Toot button */}
          <button
            ref={buttonRef}
            className={`toot-btn ${posting ? 'firing' : ''} ${!canPost ? 'disabled' : ''}`}
            onClick={handlePost}
            disabled={!canPost}
          >
            <span className="toot-btn-text">{posting ? 'FIRING...' : 'TOOT!'}</span>
          </button>

          <p className="shortcut-hint">⌘Enter で即射</p>
        </div>
      </div>

      {/* History panel - MPlayer playlist style */}
      {historyOpen && (
        <div className="history-panel">
          <div className="history-panel-header">
            <span className="history-panel-title">AMMO LOG</span>
            <button className="history-close-btn" onClick={handleToggleHistory}>
              ✕
            </button>
          </div>
          <div className="history-list">
            {lastPosts.length === 0 && <div className="history-empty">NO AMMO</div>}
            {lastPosts.map((p, i) => (
              <div key={i} className={`history-item ${i === 0 ? 'latest' : ''}`}>
                <span className="history-num">{String(i + 1).padStart(2, '0')}</span>
                <div className="history-content">
                  <span className="history-text">
                    {p.text.slice(0, 120)}
                    {p.text.length > 120 ? '…' : ''}
                  </span>
                  <span className="history-time">{formatTime(p.time)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
