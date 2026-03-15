import { useState, useEffect, useRef, useCallback } from 'react'
import HashtagPanel from './HashtagPanel'
import SparkEffect from './SparkEffect'
import type { MastodonAccount, Visibility, Spark, PostHistory } from '../types'

const MAX_CHARS = 500

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Load hashtags and recent posts from store
  useEffect(() => {
    async function load() {
      const savedHashtags = (await window.api.store.get('hashtags')) as string[] | undefined
      const savedActive = (await window.api.store.get('activeHashtags')) as string[] | undefined
      const savedPosts = (await window.api.store.get('lastPosts')) as PostHistory[] | undefined
      const savedVisibility = (await window.api.store.get('visibility')) as Visibility | undefined
      if (savedHashtags) setHashtags(savedHashtags)
      if (savedActive) setActiveHashtags(savedActive)
      if (savedPosts) setLastPosts(savedPosts)
      if (savedVisibility) setVisibility(savedVisibility)
    }
    load()
    textareaRef.current?.focus()
  }, [])

  // Compose full status text with active hashtags
  const fullText = text
    ? text + (activeHashtags.length ? '\n\n' + activeHashtags.map((t) => `#${t}`).join(' ') : '')
    : ''

  const charCount = fullText.length
  const remaining = MAX_CHARS - charCount
  const canPost = text.trim().length > 0 && remaining >= 0 && !posting

  const fireEffect = useCallback(() => {
    // Screen shake
    setShaking(true)
    setTimeout(() => setShaking(false), 300)

    // Muzzle flash
    setFlash(true)
    setTimeout(() => setFlash(false), 120)

    // Spark particles from button
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

    const serverUrl = (await window.api.store.get('serverUrl')) as string
    const token = (await window.api.store.get('token')) as string

    setPosting(true)
    setError(null)

    try {
      await window.api.mastodon.post({ serverUrl, token, status: fullText, visibility })
      fireEffect()

      // Save to history
      const newPost: PostHistory = { text: fullText, time: new Date().toISOString() }
      const updatedPosts = [newPost, ...lastPosts].slice(0, 10)
      setLastPosts(updatedPosts)
      await window.api.store.set('lastPosts', updatedPosts)

      // Clear text, keep hashtags
      setText('')
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

  const remainingClass = remaining < 0 ? 'danger' : remaining < 30 ? 'warning' : ''

  return (
    <div className={`composer-screen ${shaking ? 'shake' : ''}`}>
      {flash && <div className="muzzle-flash" />}
      <SparkEffect sparks={sparks} />

      {/* Header */}
      <div className="composer-header">
        <div className="logo-small">
          <span>🔫</span>
          <span className="logo-text-small">TootGun</span>
        </div>
        <div className="account-info">
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

          <span className={`char-count ${remainingClass}`}>{remaining}</span>
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
          <span className="toot-btn-icon">🔫</span>
          <span className="toot-btn-text">{posting ? 'FIRING...' : 'TOOT!'}</span>
        </button>

        <p className="shortcut-hint">⌘Enter で即射</p>
      </div>

      {/* Recent posts */}
      {lastPosts.length > 0 && (
        <div className="recent-posts">
          <div className="recent-title">最近の弾丸</div>
          {lastPosts.slice(0, 3).map((p, i) => (
            <div key={i} className="recent-item">
              <span className="recent-text">
                {p.text.slice(0, 60)}
                {p.text.length > 60 ? '…' : ''}
              </span>
              <span className="recent-time">
                {new Date(p.time).toLocaleTimeString('ja-JP', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
