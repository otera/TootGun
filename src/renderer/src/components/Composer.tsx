import { useState, useEffect, useRef, useCallback } from 'react'
import HashtagPanel from './HashtagPanel'
import SparkEffect from './SparkEffect'
import EmojiPicker from './EmojiPicker'
import EmojiAutocomplete from './EmojiAutocomplete'
import HistoryPanel from './HistoryPanel'
import AttachmentList from './AttachmentList'
import UndoBar from './UndoBar'
import { useAttachments, MAX_ATTACHMENTS } from '../hooks/useAttachments'
import { useCustomEmojis } from '../hooks/useCustomEmojis'
import { useEmojiInput } from '../hooks/useEmojiInput'
import { useHistoryPanel } from '../hooks/useHistoryPanel'
import { useFireEffect } from '../hooks/useFireEffect'
import type { MastodonAccount, Visibility, PostHistory, CustomEmoji } from '../types'

const MAX_CHARS = 500
const UNDO_WINDOW_MS = 10000
const HISTORY_LIMIT = 10

interface ComposerProps {
  account: MastodonAccount
  onLogout: () => void
}

/** 直前の投稿の取り消し情報。text/cwText はハッシュタグ付与前の原文を保持する */
interface UndoState {
  id: string
  text: string
  cwText: string
}

export default function Composer({ account, onLogout }: ComposerProps) {
  const [text, setText] = useState('')
  const [cwEnabled, setCwEnabled] = useState(false)
  const [cwText, setCwText] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [activeHashtags, setActiveHashtags] = useState<string[]>([])
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [lastPosts, setLastPosts] = useState<PostHistory[]>([])
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<UndoState | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const cwInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const attachments = useAttachments()
  const history = useHistoryPanel()
  const effect = useFireEffect(buttonRef)
  const emojis = useCustomEmojis()
  const emojiInput = useEmojiInput({
    text,
    setText,
    textareaRef,
    customEmojis: emojis.customEmojis,
    onInsert: emojis.pushRecent
  })

  useEffect(() => {
    async function load() {
      const { store } = window.api
      const [savedHashtags, savedActive, savedPosts, savedVisibility, savedAlwaysOnTop] =
        await Promise.all([
          store.get('hashtags'),
          store.get('activeHashtags'),
          store.get('lastPosts'),
          store.get('visibility'),
          store.get('alwaysOnTop')
        ])
      if (savedHashtags) setHashtags(savedHashtags)
      if (savedActive) setActiveHashtags(savedActive)
      if (savedPosts) setLastPosts(savedPosts)
      if (savedVisibility) setVisibility(savedVisibility)
      if (savedAlwaysOnTop) {
        setAlwaysOnTop(true)
        await window.api.window.setAlwaysOnTop(true)
      }
    }
    load()
    textareaRef.current?.focus()
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    }
  }, [])

  const fullText = text
    ? text + (activeHashtags.length ? '\n\n' + activeHashtags.map((t) => `#${t}`).join(' ') : '')
    : ''

  const charCount = fullText.length + (cwEnabled ? cwText.length : 0)
  const remaining = MAX_CHARS - charCount
  const canPost =
    (text.trim().length > 0 || !attachments.isEmpty) &&
    remaining >= 0 &&
    !posting &&
    !attachments.uploading &&
    !attachments.failed

  const saveLastPosts = async (posts: PostHistory[]) => {
    setLastPosts(posts)
    await window.api.store.set('lastPosts', posts)
  }

  const handlePost = async () => {
    if (!canPost) return

    setPosting(true)
    setError(null)

    try {
      const posted = await window.api.mastodon.post({
        status: fullText,
        visibility,
        spoiler_text: cwEnabled ? cwText.trim() || undefined : undefined,
        media_ids: attachments.mediaIds.length > 0 ? attachments.mediaIds : undefined
      })
      effect.fire()

      const newPost: PostHistory = { id: posted.id, text: fullText, time: new Date().toISOString() }
      await saveLastPosts([newPost, ...lastPosts].slice(0, HISTORY_LIMIT))

      if (posted.id) {
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
        setUndo({ id: posted.id, text, cwText: cwEnabled ? cwText : '' })
        undoTimerRef.current = setTimeout(() => setUndo(null), UNDO_WINDOW_MS)
      }

      setText('')
      setCwText('')
      attachments.clear()
      textareaRef.current?.focus()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPosting(false)
    }
  }

  /**
   * 直前の投稿を取り消す。サーバーから削除し、ログからも取り除く。
   * @param redraft trueなら削除後に本文をテキストエリアへ復元して編集し直せるようにする
   */
  const handleUndo = async (redraft: boolean) => {
    if (!undo || undoBusy) return
    setUndoBusy(true)
    setError(null)

    try {
      await window.api.mastodon.delete(undo.id)
      await saveLastPosts(lastPosts.filter((p) => p.id !== undo.id))

      if (redraft) {
        setText(undo.text)
        if (undo.cwText) {
          setCwEnabled(true)
          setCwText(undo.cwText)
        }
      }

      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      setUndo(null)
      textareaRef.current?.focus()
    } catch (err) {
      setError(`取り消し失敗: ${(err as Error).message}`)
    } finally {
      setUndoBusy(false)
    }
  }

  const handlePickerSelect = (c: CustomEmoji) => {
    setPickerOpen(false)
    emojiInput.insertEmoji(c)
  }

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false)
    textareaRef.current?.focus()
  }, [])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    emojiInput.updateSuggest(e.target.value, e.target.selectionStart)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handlePost()
      return
    }
    emojiInput.handleSuggestKeyDown(e)
  }

  const handleToggleCw = () => {
    const next = !cwEnabled
    setCwEnabled(next)
    if (next) {
      setTimeout(() => cwInputRef.current?.focus(), 50)
    } else {
      setCwText('')
      textareaRef.current?.focus()
    }
  }

  const handleVisibilityChange = async (v: Visibility) => {
    setVisibility(v)
    await window.api.store.set('visibility', v)
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

  const remainingClass = remaining < 0 ? 'danger' : remaining < 30 ? 'warning' : ''

  return (
    <div
      className={`composer-screen ${effect.shaking ? 'shake' : ''} ${alwaysOnTop ? 'always-on-top' : ''}`}
      {...attachments.dragHandlers}
    >
      {effect.flash && <div className="muzzle-flash" />}
      {attachments.dragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">
            {attachments.isFull
              ? `添付は最大${MAX_ATTACHMENTS}枚までです`
              : '🖼 ここにドロップして添付'}
          </div>
        </div>
      )}
      <SparkEffect sparks={effect.sparks} />

      {/* Main area */}
      <div className="main-area">
        {/* Header */}
        <div className="composer-header">
          <div className="logo-small">
            <span className="logo-text-small">TootGun</span>
          </div>
          <div className="account-info">
            <button
              className={`hist-btn ${history.open ? 'active' : ''}`}
              onClick={history.toggle}
              title={history.open ? 'ログを閉じる' : '投稿ログを開く'}
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
              maxLength={MAX_CHARS}
            />
          )}
          <div className="toot-input-wrap">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onPaste={attachments.onPaste}
              onClick={(e) => emojiInput.updateSuggest(text, e.currentTarget.selectionStart)}
              onBlur={emojiInput.clearSuggest}
              placeholder="今すぐブチ込め！"
              className="toot-input"
              rows={5}
            />
            {emojiInput.suggest && (
              <EmojiAutocomplete
                candidates={emojiInput.suggest.candidates}
                selectedIndex={emojiInput.suggest.index}
                onSelect={emojiInput.applySuggestion}
                onHover={emojiInput.setSuggestIndex}
              />
            )}
          </div>

          {/* Visibility */}
          <div className="options-row">
            <select
              className="visibility-select"
              value={visibility}
              onChange={(e) => handleVisibilityChange(e.target.value as Visibility)}
            >
              <option value="public">🌍 公開</option>
              <option value="unlisted">🔓 未収載</option>
              <option value="private">🔒 フォロワーのみ</option>
              <option value="direct">✉️ ダイレクト</option>
            </select>

            <div className="options-right">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="attach-input"
                onChange={(e) => {
                  attachments.addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <button
                className="attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.isFull}
                title={attachments.isFull ? `画像は最大${MAX_ATTACHMENTS}枚まで` : '画像を添付'}
              >
                🖼{' '}
                {attachments.isEmpty ? '' : `${attachments.attachments.length}/${MAX_ATTACHMENTS}`}
              </button>
              <button
                className={`emoji-toggle-btn ${pickerOpen ? 'active' : ''}`}
                onClick={() => setPickerOpen((v) => !v)}
                title="カスタム絵文字を挿入"
                type="button"
              >
                😀
              </button>
              <button
                className={`cw-toggle-btn ${cwEnabled ? 'active' : ''}`}
                onClick={handleToggleCw}
                title={cwEnabled ? 'CW解除' : '注意書き（Content Warning）を追加'}
              >
                CW
              </button>
              <span className={`char-count ${remainingClass}`}>{remaining}</span>
            </div>
          </div>

          {pickerOpen && (
            <EmojiPicker
              customEmojis={emojis.customEmojis}
              loading={emojis.loading}
              recent={emojis.recent}
              onSelect={handlePickerSelect}
              onClose={handlePickerClose}
            />
          )}

          <AttachmentList
            attachments={attachments.attachments}
            onRemove={attachments.remove}
            onDescriptionChange={attachments.setDescription}
            onDescriptionBlur={attachments.commitDescription}
          />

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

          {undo ? (
            // key で投稿ごとにカウントダウンのアニメーションをやり直す
            <UndoBar key={undo.id} windowMs={UNDO_WINDOW_MS} busy={undoBusy} onUndo={handleUndo} />
          ) : (
            <p className="shortcut-hint">⌘Enter で即射</p>
          )}
        </div>
      </div>

      {history.open && (
        <HistoryPanel
          posts={lastPosts}
          width={history.width}
          isResizing={history.isResizing}
          onResizeMouseDown={history.handleResizeMouseDown}
          onClose={history.toggle}
        />
      )}
    </div>
  )
}
