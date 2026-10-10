import { describe, expect, it } from 'vitest'
import type { CustomEmoji } from '../types'
import { MAX_SUGGESTIONS, detectShortcodeQuery, insertionText, searchEmojis } from './emojiIndex'

const emoji = (shortcode: string): CustomEmoji => ({
  shortcode,
  url: `https://example.com/${shortcode}.png`,
  static_url: `https://example.com/${shortcode}_static.png`,
  category: null
})

describe('detectShortcodeQuery', () => {
  it('行頭の :query を検出する', () => {
    expect(detectShortcodeQuery(':bl', 3)).toEqual({ start: 0, query: 'bl' })
  })

  it('空白の後の :query を検出し、start は : の位置を指す', () => {
    const text = 'hello :bl'
    expect(detectShortcodeQuery(text, text.length)).toEqual({ start: 6, query: 'bl' })
  })

  it('カーソルより後ろの文字は無視する', () => {
    expect(detectShortcodeQuery(':blob xyz', 5)).toEqual({ start: 0, query: 'blob' })
  })

  it('時刻表記 12:30 のように直前が空白でなければ検出しない', () => {
    expect(detectShortcodeQuery('12:30', 5)).toBeNull()
  })

  it('クエリが1文字では検出しない', () => {
    expect(detectShortcodeQuery(':b', 2)).toBeNull()
  })

  it('閉じた :code: の後は検出しない', () => {
    expect(detectShortcodeQuery(':blob:', 6)).toBeNull()
  })
})

describe('searchEmojis', () => {
  const emojis = [emoji('ablob'), emoji('blob'), emoji('blobcat'), emoji('cat'), emoji('Blobby')]

  it('前方一致を部分一致より先に並べる', () => {
    expect(searchEmojis(emojis, 'blob').map((e) => e.shortcode)).toEqual([
      'blob',
      'blobcat',
      'Blobby',
      'ablob'
    ])
  })

  it('大文字小文字を区別しない', () => {
    expect(searchEmojis(emojis, 'BLOBBY').map((e) => e.shortcode)).toEqual(['Blobby'])
  })

  it('limit で件数を絞る', () => {
    expect(searchEmojis(emojis, 'b', 2)).toHaveLength(2)
  })

  it('空クエリなら先頭から limit 件返す', () => {
    const many = Array.from({ length: MAX_SUGGESTIONS + 5 }, (_, i) => emoji(`e${i}`))
    expect(searchEmojis(many, '')).toHaveLength(MAX_SUGGESTIONS)
  })

  it('該当なしなら空配列', () => {
    expect(searchEmojis(emojis, 'zzz')).toEqual([])
  })
})

describe('insertionText', () => {
  it('コロンで囲んだショートコードを返す', () => {
    expect(insertionText(emoji('blob'))).toBe(':blob:')
  })
})
