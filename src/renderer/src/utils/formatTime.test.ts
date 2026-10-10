import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatTime } from './formatTime'

const NOW = new Date('2026-09-13T12:00:00+09:00')

const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('1分未満は秒単位', () => {
    expect(formatTime(ago(30 * SEC))).toBe('30 秒前')
  })

  it('1時間未満は分単位', () => {
    expect(formatTime(ago(5 * MIN))).toBe('5 分前')
  })

  it('1日未満は時間単位', () => {
    expect(formatTime(ago(2 * HOUR))).toBe('2 時間前')
  })

  it('30日未満は日単位（numeric: auto なので1日前は「昨日」）', () => {
    expect(formatTime(ago(1 * DAY))).toBe('昨日')
    expect(formatTime(ago(3 * DAY))).toBe('3 日前')
  })

  it('1年未満は月単位', () => {
    expect(formatTime(ago(65 * DAY))).toBe('2 か月前')
  })

  it('1年以上は絶対日時', () => {
    expect(formatTime('2024-06-01T12:34:56+09:00')).toBe('2024/06/01 12:34:56')
  })
})
