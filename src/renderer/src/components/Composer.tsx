import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import HashtagPanel from './HashtagPanel'
import SparkEffect from './SparkEffect'
import EmojiPicker from './EmojiPicker'
import EmojiAutocomplete from './EmojiAutocomplete'
import { detectShortcodeQuery, insertionText, searchEmojis } from '../emoji/emojiIndex'
import type {
  MastodonAccount,
  Visibility,
  Spark,
  PostHistory,
  CustomEmoji,
  MediaAttachment
} from '../types'

const MAX_CHARS = 500
const UNDO_WINDOW_MS = 10000
const MIN_HISTORY_WIDTH = 180
const MAX_HISTORY_WIDTH = 600
const DEFAULT_HISTORY_WIDTH = 280
const MAX_ATTACHMENTS = 4

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
const HANDLE_WIDTH = 5
const MAX_RECENT_EMOJIS = 24

interface ComposerProps {
  account: MastodonAccount
  onLogout: () => void
}

/** ショートコード補完の状態。start は本文中の `:` の位置 */
interface SuggestState {
  start: number
  query: string
  candidates: CustomEmoji[]
  index: number
}

/** 直前の投稿の取り消し情報。text/cwText はハッシュタグ付与前の原文を保持する */
interface UndoState {
  id: string
  text: string
  cwText: string
}

/** コンポーザー内で管理する画像添付1件分の状態。アップロード完了後にmediaIdが入る */
interface ComposerAttachment {
  localId: string
  file: File
  previewUrl: string
  description: string
  mediaId?: string
  uploading: boolean
  error?: string
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
  const [undo, setUndo] = useState<UndoState | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyWidth, setHistoryWidth] = useState(DEFAULT_HISTORY_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const historyWidthRef = useRef(DEFAULT_HISTORY_WIDTH)
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([])
  const [emojiLoading, setEmojiLoading] = useState(true)
  const [recentEmojis, setRecentEmojis] = useState<CustomEmoji[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [suggest, setSuggest] = useState<SuggestState | null>(null)
  /** setText 後に復元するカーソル位置。絵文字挿入で使う */
  const pendingCaretRef = useRef<number | null>(null)
  const cwInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const attachmentsRef = useRef<ComposerAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const savedHashtags = (await window.api.store.get('hashtags')) as string[] | undefined
      const savedActive = (await window.api.store.get('activeHashtags')) as string[] | undefined
      const savedPosts = (await window.api.store.get('lastPosts')) as PostHistory[] | undefined
      const savedVisibility = (await window.api.store.get('visibility')) as Visibility | undefined
      const savedAlwaysOnTop = (await window.api.store.get('alwaysOnTop')) as boolean | undefined
      const savedHistoryOpen = (await window.api.store.get('historyOpen')) as boolean | undefined
      const savedRecent = (await window.api.store.get('recentEmojis')) as CustomEmoji[] | undefined
      const cachedEmojis = (await window.api.store.get('customEmojisCache')) as
        CustomEmoji[] | undefined
      if (savedRecent) setRecentEmojis(savedRecent)
      if (cachedEmojis) setCustomEmojis(cachedEmojis)
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
        await window.api.window.setWidth(MAIN_WIDTH + HANDLE_WIDTH + DEFAULT_HISTORY_WIDTH)
      }
    }
    load()

    // サーバー独自絵文字を取得。前回のキャッシュを先に出しておき、取得できたら差し替える
    async function loadCustomEmojis() {
      try {
        const list = await window.api.mastodon.customEmojis()
        setCustomEmojis(list)
        await window.api.store.set('customEmojisCache', list)
      } catch {
        // 取得失敗時はキャッシュ（なければ空）のまま。標準絵文字は使える
      } finally {
        setEmojiLoading(false)
      }
    }
    loadCustomEmojis()

    textareaRef.current?.focus()
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl))
    }
  }, [])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  const fullText = text
    ? text + (activeHashtags.length ? '\n\n' + activeHashtags.map((t) => `#${t}`).join(' ') : '')
    : ''

  const charCount = fullText.length + (cwEnabled ? cwText.length : 0)
  const remaining = MAX_CHARS - charCount
  const hasAttachments = attachments.length > 0
  const attachmentsUploading = attachments.some((a) => a.uploading)
  const attachmentsFailed = attachments.some((a) => a.error && !a.mediaId)
  const canPost =
    (text.trim().length > 0 || hasAttachments) &&
    remaining >= 0 &&
    !posting &&
    !attachmentsUploading &&
    !attachmentsFailed

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

  /** 選択された画像ファイルをMastodonへアップロードし、成功したらmediaIdを反映する */
  const uploadAttachment = async (localId: string, file: File) => {
    try {
      const data = await file.arrayBuffer()
      const media = (await window.api.mastodon.uploadMedia({
        data,
        filename: file.name,
        mimeType: file.type
      })) as MediaAttachment
      setAttachments((prev) =>
        prev.map((a) => (a.localId === localId ? { ...a, mediaId: media.id, uploading: false } : a))
      )
    } catch (err) {
      setAttachments((prev) =>
        prev.map((a) =>
          a.localId === localId ? { ...a, uploading: false, error: (err as Error).message } : a
        )
      )
    }
  }

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const available = MAX_ATTACHMENTS - attachments.length
    const selected = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, Math.max(0, available))

    const newAttachments: ComposerAttachment[] = selected.map((file) => ({
      localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      description: '',
      uploading: true
    }))
    if (newAttachments.length === 0) return

    setAttachments((prev) => [...prev, ...newAttachments])
    newAttachments.forEach((a) => uploadAttachment(a.localId, a.file))
  }

  const handleRemoveAttachment = (localId: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.localId === localId)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((a) => a.localId !== localId)
    })
  }

  const handleAltTextChange = (localId: string, value: string) => {
    setAttachments((prev) =>
      prev.map((a) => (a.localId === localId ? { ...a, description: value } : a))
    )
  }

  /** Altテキストの入力欄からフォーカスが外れたタイミングでサーバーへ反映する */
  const handleAltTextBlur = async (localId: string) => {
    const attachment = attachmentsRef.current.find((a) => a.localId === localId)
    if (!attachment || !attachment.mediaId) return
    try {
      await window.api.mastodon.updateMedia(attachment.mediaId, attachment.description)
    } catch {
      // Altテキストの反映失敗は投稿をブロックしない
    }
  }

  const handlePost = async () => {
    if (!canPost) return

    setPosting(true)
    setError(null)

    try {
      const mediaIds = attachments.filter((a) => a.mediaId).map((a) => a.mediaId as string)
      const posted = (await window.api.mastodon.post({
        status: fullText,
        visibility,
        spoiler_text: cwEnabled ? cwText.trim() || undefined : undefined,
        media_ids: mediaIds.length > 0 ? mediaIds : undefined
      })) as { id?: string }
      fireEffect()

      const newPost: PostHistory = {
        id: posted?.id,
        text: fullText,
        time: new Date().toISOString()
      }
      const updatedPosts = [newPost, ...lastPosts].slice(0, 10)
      setLastPosts(updatedPosts)
      await window.api.store.set('lastPosts', updatedPosts)

      if (posted?.id) {
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
        setUndo({ id: posted.id, text, cwText: cwEnabled ? cwText : '' })
        undoTimerRef.current = setTimeout(() => setUndo(null), UNDO_WINDOW_MS)
      }

      setText('')
      setCwText('')
      attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl))
      setAttachments([])
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

      const updatedPosts = lastPosts.filter((p) => p.id !== undo.id)
      setLastPosts(updatedPosts)
      await window.api.store.set('lastPosts', updatedPosts)

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

  // 絵文字挿入後、React の再描画でカーソルが末尾へ飛ぶのを防ぐ
  useLayoutEffect(() => {
    const caret = pendingCaretRef.current
    if (caret === null) return
    pendingCaretRef.current = null
    const el = textareaRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(caret, caret)
    }
  }, [text])

  /** カーソル直前の `:query` を見て補完候補を更新する */
  const updateSuggest = useCallback(
    (value: string, caret: number) => {
      const hit = detectShortcodeQuery(value, caret)
      if (!hit) {
        setSuggest(null)
        return
      }
      const candidates = searchEmojis(customEmojis, hit.query)
      if (candidates.length === 0) {
        setSuggest(null)
        return
      }
      setSuggest((prev) => ({
        start: hit.start,
        query: hit.query,
        candidates,
        // 同じクエリの続きなら選択位置を保つ
        index: prev && prev.start === hit.start ? Math.min(prev.index, candidates.length - 1) : 0
      }))
    },
    [customEmojis]
  )

  const pushRecent = async (c: CustomEmoji) => {
    const next = [c, ...recentEmojis.filter((r) => r.shortcode !== c.shortcode)].slice(
      0,
      MAX_RECENT_EMOJIS
    )
    setRecentEmojis(next)
    await window.api.store.set('recentEmojis', next)
  }

  /**
   * 本文の range を絵文字で置き換える（range 省略時はカーソル位置に挿入）。
   * 直後に空白を1つ入れて、続けて打ちやすくする。
   */
  const insertEmoji = (c: CustomEmoji, range?: { start: number; end: number }) => {
    const el = textareaRef.current
    const start = range?.start ?? el?.selectionStart ?? text.length
    const end = range?.end ?? el?.selectionEnd ?? text.length
    const inserted = insertionText(c) + ' '
    const next = text.slice(0, start) + inserted + text.slice(end)
    pendingCaretRef.current = start + inserted.length
    setText(next)
    setSuggest(null)
    pushRecent(c)
  }

  const applySuggestion = (c: CustomEmoji) => {
    if (!suggest) return
    insertEmoji(c, { start: suggest.start, end: suggest.start + suggest.query.length + 1 })
  }

  const handlePickerSelect = (c: CustomEmoji) => {
    setPickerOpen(false)
    insertEmoji(c)
  }

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false)
    textareaRef.current?.focus()
  }, [])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    updateSuggest(e.target.value, e.target.selectionStart)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handlePost()
      return
    }
    if (!suggest) return

    // 補完ポップアップ表示中のキー操作
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSuggest({ ...suggest, index: (suggest.index + 1) % suggest.candidates.length })
        break
      case 'ArrowUp':
        e.preventDefault()
        setSuggest({
          ...suggest,
          index: (suggest.index - 1 + suggest.candidates.length) % suggest.candidates.length
        })
        break
      case 'Enter':
      case 'Tab':
        e.preventDefault()
        applySuggestion(suggest.candidates[suggest.index])
        break
      case 'Escape':
        e.preventDefault()
        setSuggest(null)
        break
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
      await window.api.window.setWidth(MAIN_WIDTH + HANDLE_WIDTH + historyWidthRef.current)
      setHistoryOpen(true)
    } else {
      setHistoryOpen(false)
      await window.api.window.setWidth(MAIN_WIDTH)
    }
  }

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = historyWidthRef.current
    setIsResizing(true)
    document.body.style.cursor = 'col-resize'

    const onMove = (e: MouseEvent) => {
      const diff = startX - e.clientX
      const newWidth = Math.max(MIN_HISTORY_WIDTH, Math.min(MAX_HISTORY_WIDTH, startWidth + diff))
      historyWidthRef.current = newWidth
      setHistoryWidth(newWidth)
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      setIsResizing(false)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

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
          <div className="toot-input-wrap">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onClick={(e) => updateSuggest(text, e.currentTarget.selectionStart)}
              onBlur={() => setSuggest(null)}
              placeholder="今すぐブチ込め！"
              className="toot-input"
              rows={5}
            />
            {suggest && (
              <EmojiAutocomplete
                candidates={suggest.candidates}
                selectedIndex={suggest.index}
                onSelect={applySuggestion}
                onHover={(i) => setSuggest({ ...suggest, index: i })}
              />
            )}
          </div>

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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="attach-input"
                onChange={(e) => {
                  handleFilesSelected(e.target.files)
                  e.target.value = ''
                }}
              />
              <button
                className="attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= MAX_ATTACHMENTS}
                title={
                  attachments.length >= MAX_ATTACHMENTS
                    ? `画像は最大${MAX_ATTACHMENTS}枚まで`
                    : '画像を添付'
                }
              >
                🖼 {attachments.length > 0 ? `${attachments.length}/${MAX_ATTACHMENTS}` : ''}
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

          {pickerOpen && (
            <EmojiPicker
              customEmojis={customEmojis}
              loading={emojiLoading}
              recent={recentEmojis}
              onSelect={handlePickerSelect}
              onClose={handlePickerClose}
            />
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="attachments-row">
              {attachments.map((a) => (
                <div
                  key={a.localId}
                  className={`attachment-item ${a.uploading ? 'uploading' : ''}`}
                >
                  <div className="attachment-preview">
                    <img src={a.previewUrl} alt="" />
                    {a.uploading && <div className="attachment-spinner">アップロード中…</div>}
                    <button
                      type="button"
                      className="attachment-remove-btn"
                      onClick={() => handleRemoveAttachment(a.localId)}
                      title="添付を削除"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    type="text"
                    className="attachment-alt-input"
                    value={a.description}
                    onChange={(e) => handleAltTextChange(a.localId, e.target.value)}
                    onBlur={() => handleAltTextBlur(a.localId)}
                    placeholder="Altテキスト（画像の説明）"
                    maxLength={1500}
                    disabled={a.uploading}
                  />
                  {a.error && <span className="attachment-error">{a.error}</span>}
                </div>
              ))}
            </div>
          )}

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

          {undo ? (
            <div className="undo-bar" key={undo.id}>
              <div
                className="undo-countdown"
                style={{ animationDuration: `${UNDO_WINDOW_MS}ms` }}
              />
              <span className="undo-label">着弾確認</span>
              <div className="undo-actions">
                <button
                  className="undo-btn"
                  onClick={() => handleUndo(false)}
                  disabled={undoBusy}
                  title="直前のTootを削除"
                >
                  🗑 取消
                </button>
                <button
                  className="undo-btn edit"
                  onClick={() => handleUndo(true)}
                  disabled={undoBusy}
                  title="直前のTootを削除して本文を編集し直す"
                >
                  ✏️ 取消して編集
                </button>
              </div>
            </div>
          ) : (
            <p className="shortcut-hint">⌘Enter で即射</p>
          )}
        </div>
      </div>

      {/* History panel - MPlayer playlist style */}
      {historyOpen && (
        <>
          <div
            className={`resize-handle ${isResizing ? 'dragging' : ''}`}
            onMouseDown={handleResizeMouseDown}
          />
          <div className="history-panel" style={{ width: historyWidth }}>
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
        </>
      )}
    </div>
  )
}
