import { useEffect, useState } from 'react'
import type { CustomEmoji } from '../types'

const MAX_RECENT_EMOJIS = 24

/**
 * サーバー独自絵文字の一覧と「最近使った絵文字」を管理する。
 * 一覧は前回のキャッシュを先に出しておき、サーバーから取得できたら差し替える。
 */
export function useCustomEmojis() {
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([])
  const [loading, setLoading] = useState(true)
  const [recent, setRecent] = useState<CustomEmoji[]>([])

  useEffect(() => {
    async function load() {
      const [savedRecent, cached] = await Promise.all([
        window.api.store.get('recentEmojis'),
        window.api.store.get('customEmojisCache')
      ])
      if (savedRecent) setRecent(savedRecent)
      if (cached) setCustomEmojis(cached)

      try {
        const list = await window.api.mastodon.customEmojis()
        setCustomEmojis(list)
        await window.api.store.set('customEmojisCache', list)
      } catch {
        // 取得失敗時はキャッシュ（なければ空）のまま。標準絵文字は使える
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const pushRecent = async (c: CustomEmoji) => {
    const next = [c, ...recent.filter((r) => r.shortcode !== c.shortcode)].slice(
      0,
      MAX_RECENT_EMOJIS
    )
    setRecent(next)
    await window.api.store.set('recentEmojis', next)
  }

  return { customEmojis, loading, recent, pushRecent }
}
