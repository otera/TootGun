import { useEffect, useMemo, useRef, useState } from 'react'
import type { CustomEmoji } from '../types'
import { searchEmojis } from '../emoji/emojiIndex'

const SEARCH_LIMIT = 60

interface EmojiPickerProps {
  customEmojis: CustomEmoji[]
  /** カスタム絵文字の読み込み中フラグ */
  loading: boolean
  recent: CustomEmoji[]
  onSelect: (emoji: CustomEmoji) => void
  onClose: () => void
}

interface Section {
  key: string
  label: string
  items: CustomEmoji[]
}

/**
 * サーバー独自絵文字のピッカー。検索欄、最近使った絵文字、カテゴリ別一覧を縦に並べる。
 * 標準（Unicode）絵文字はIMEやOSの絵文字パレットで入力できるため扱わない。
 * Escape または外側クリックで閉じる。
 */
export default function EmojiPicker({
  customEmojis,
  loading,
  recent,
  onSelect,
  onClose
}: EmojiPickerProps) {
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Element
      // 開閉ボタン自身のクリックはボタン側のトグルに任せる（閉じた直後に再び開くのを防ぐ）
      if (target.closest('.emoji-toggle-btn')) return
      if (rootRef.current && !rootRef.current.contains(target)) onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [onClose])

  const sections = useMemo<Section[]>(() => {
    const q = query.trim()
    if (q) {
      return [
        { key: 'search', label: '検索結果', items: searchEmojis(customEmojis, q, SEARCH_LIMIT) }
      ]
    }

    const result: Section[] = []
    if (recent.length) result.push({ key: 'recent', label: '最近使用', items: recent })

    // サーバーが返すカテゴリ順を保ちつつグループ化する
    const byCategory = new Map<string, CustomEmoji[]>()
    for (const c of customEmojis) {
      const label = c.category ?? 'その他'
      if (!byCategory.has(label)) byCategory.set(label, [])
      byCategory.get(label)!.push(c)
    }
    for (const [label, items] of byCategory) {
      result.push({ key: `cat:${label}`, label, items })
    }
    return result
  }, [query, customEmojis, recent])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    // 検索結果が1件以上あるときに Enter で先頭を選択
    if (e.key === 'Enter' && query.trim()) {
      const first = sections[0]?.items[0]
      if (first) {
        e.preventDefault()
        onSelect(first)
      }
    }
  }

  const empty = !loading && customEmojis.length === 0

  return (
    <div className="emoji-picker" ref={rootRef} onKeyDown={handleKeyDown}>
      <div className="emoji-picker-header">
        <input
          ref={inputRef}
          className="emoji-picker-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="カスタム絵文字を検索"
          spellCheck={false}
        />
        <button className="emoji-picker-close" type="button" onClick={onClose} title="閉じる">
          ✕
        </button>
      </div>
      <div className="emoji-picker-body">
        {loading && customEmojis.length === 0 && (
          <div className="emoji-picker-note">カスタム絵文字を読み込み中…</div>
        )}
        {empty && (
          <div className="emoji-picker-note">
            このサーバーにはカスタム絵文字がありません。標準の絵文字はIMEから入力できます
          </div>
        )}
        {sections.map((s) =>
          s.items.length === 0 ? (
            <div key={s.key} className="emoji-picker-note">
              該当なし
            </div>
          ) : (
            <div key={s.key} className="emoji-picker-section">
              <div className="emoji-picker-section-title">{s.label}</div>
              <div className="emoji-picker-grid">
                {s.items.map((c) => (
                  <button
                    key={c.shortcode}
                    type="button"
                    className="emoji-picker-cell"
                    title={`:${c.shortcode}:`}
                    onClick={() => onSelect(c)}
                  >
                    <img src={c.url} alt={`:${c.shortcode}:`} loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
