import type { CustomEmoji } from '../types'

export const MAX_SUGGESTIONS = 8

/** ショートコードに使える文字（Mastodonの定義に合わせる） */
const SHORTCODE_CHARS = 'a-zA-Z0-9_'

/**
 * カーソル直前の `:query` を検出する。
 * `:` の直前が行頭または空白のときだけ補完対象にする（`12:30` などの時刻表記を誤検出しない）。
 * @returns 補完対象の開始位置とクエリ。該当しなければ null
 */
export function detectShortcodeQuery(
  text: string,
  caret: number
): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const match = new RegExp(`(?:^|\\s):([${SHORTCODE_CHARS}]{2,})$`).exec(before)
  if (!match) return null
  const query = match[1]
  return { start: caret - query.length - 1, query }
}

/**
 * ショートコードの部分一致で候補を検索する。前方一致 → 部分一致の順に並べる。
 */
export function searchEmojis(
  emojis: CustomEmoji[],
  query: string,
  limit = MAX_SUGGESTIONS
): CustomEmoji[] {
  const q = query.toLowerCase()
  if (!q) return emojis.slice(0, limit)
  const prefix: CustomEmoji[] = []
  const partial: CustomEmoji[] = []
  for (const c of emojis) {
    const s = c.shortcode.toLowerCase()
    if (s.startsWith(q)) prefix.push(c)
    else if (s.includes(q)) partial.push(c)
    if (prefix.length >= limit) break
  }
  return [...prefix, ...partial].slice(0, limit)
}

/** 本文へ挿入する文字列 */
export function insertionText(c: CustomEmoji): string {
  return `:${c.shortcode}:`
}
