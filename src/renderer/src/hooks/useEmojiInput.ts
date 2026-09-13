import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { detectShortcodeQuery, insertionText, searchEmojis } from '../emoji/emojiIndex'
import type { CustomEmoji } from '../types'

/** ショートコード補完の状態。start は本文中の `:` の位置 */
export interface SuggestState {
  start: number
  query: string
  candidates: CustomEmoji[]
  index: number
}

interface Options {
  text: string
  setText: (text: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  customEmojis: CustomEmoji[]
  /** 絵文字が本文に挿入されたときに呼ばれる（最近使った絵文字の更新など） */
  onInsert?: (emoji: CustomEmoji) => void
}

/**
 * 本文への絵文字挿入と、`:query` 入力時のショートコード補完を扱う。
 * 挿入後のカーソル位置の復元もここで行う。
 */
export function useEmojiInput({ text, setText, textareaRef, customEmojis, onInsert }: Options) {
  const [suggest, setSuggest] = useState<SuggestState | null>(null)
  /** setText 後に復元するカーソル位置。絵文字挿入で使う */
  const pendingCaretRef = useRef<number | null>(null)

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
  }, [text, textareaRef])

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

  const clearSuggest = useCallback(() => setSuggest(null), [])

  const setSuggestIndex = (index: number) => {
    if (suggest) setSuggest({ ...suggest, index })
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
    pendingCaretRef.current = start + inserted.length
    setText(text.slice(0, start) + inserted + text.slice(end))
    setSuggest(null)
    onInsert?.(c)
  }

  /** 補完候補で `:query` 部分を置き換える */
  const applySuggestion = (c: CustomEmoji) => {
    if (!suggest) return
    insertEmoji(c, { start: suggest.start, end: suggest.start + suggest.query.length + 1 })
  }

  /**
   * 補完ポップアップ表示中のキー操作。処理した場合は true を返す。
   */
  const handleSuggestKeyDown = (e: React.KeyboardEvent): boolean => {
    if (!suggest) return false
    const count = suggest.candidates.length
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSuggest({ ...suggest, index: (suggest.index + 1) % count })
        return true
      case 'ArrowUp':
        e.preventDefault()
        setSuggest({ ...suggest, index: (suggest.index - 1 + count) % count })
        return true
      case 'Enter':
      case 'Tab':
        e.preventDefault()
        applySuggestion(suggest.candidates[suggest.index])
        return true
      case 'Escape':
        e.preventDefault()
        setSuggest(null)
        return true
      default:
        return false
    }
  }

  return {
    suggest,
    updateSuggest,
    clearSuggest,
    setSuggestIndex,
    insertEmoji,
    applySuggestion,
    handleSuggestKeyDown
  }
}
