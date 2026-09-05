import { useEffect, useRef } from 'react'
import type { CustomEmoji } from '../types'

interface EmojiAutocompleteProps {
  candidates: CustomEmoji[]
  selectedIndex: number
  onSelect: (emoji: CustomEmoji) => void
  onHover: (index: number) => void
}

/**
 * テキストエリア下に出るショートコード補完のポップアップ。
 * キーボード操作は親（Composer）の onKeyDown 側で処理し、ここは表示とクリックだけを担当する。
 */
export default function EmojiAutocomplete({
  candidates,
  selectedIndex,
  onSelect,
  onHover
}: EmojiAutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (candidates.length === 0) return null

  return (
    <div className="emoji-suggest" ref={listRef} role="listbox">
      {candidates.map((c, i) => (
        <button
          key={c.shortcode}
          type="button"
          role="option"
          aria-selected={i === selectedIndex}
          className={`emoji-suggest-item ${i === selectedIndex ? 'selected' : ''}`}
          onMouseEnter={() => onHover(i)}
          // mousedown で preventDefault してテキストエリアのフォーカスを奪わない
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(c)}
        >
          <img className="emoji-suggest-img" src={c.static_url} alt="" loading="lazy" />
          <span className="emoji-suggest-code">:{c.shortcode}:</span>
        </button>
      ))}
    </div>
  )
}
