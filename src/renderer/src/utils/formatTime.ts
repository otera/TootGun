/**
 * 日付を「5分前」「2時間前」「3日前」のように相対的な表現に変換。
 * 1年を超える場合は「2024/06/01 12:34:56」のように絶対日時で変換。
 * @param isoString ISO形式の日付文字列
 * @returns フォーマットされた日時文字列
 */
export function formatTime(isoString: string): string {
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
