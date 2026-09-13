import { useCallback, useState, type RefObject } from 'react'
import type { Spark } from '../types'

const SPARK_COUNT = 18
const SPARK_COLORS = ['#ff6b00', '#ffcc00', '#ff3300', '#ffffff']
const SHAKE_MS = 300
const FLASH_MS = 120
const SPARK_LIFETIME_MS = 700

/**
 * 投稿時の演出（画面シェイク・マズルフラッシュ・スパーク）。
 * スパークは originRef の要素の中心から放つ。
 */
export function useFireEffect(originRef: RefObject<HTMLElement | null>) {
  const [shaking, setShaking] = useState(false)
  const [flash, setFlash] = useState(false)
  const [sparks, setSparks] = useState<Spark[]>([])

  const fire = useCallback(() => {
    setShaking(true)
    setTimeout(() => setShaking(false), SHAKE_MS)

    setFlash(true)
    setTimeout(() => setFlash(false), FLASH_MS)

    const origin = originRef.current
    if (!origin) return
    const rect = origin.getBoundingClientRect()
    const originX = rect.left + rect.width / 2
    const originY = rect.top + rect.height / 2
    const newSparks: Spark[] = Array.from({ length: SPARK_COUNT }, (_, i) => ({
      id: Date.now() + i,
      x: originX,
      y: originY,
      angle: (i / SPARK_COUNT) * 360 + Math.random() * 20 - 10,
      speed: 80 + Math.random() * 120,
      size: 3 + Math.random() * 5,
      color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)]
    }))
    setSparks((prev) => [...prev, ...newSparks])
    setTimeout(() => {
      const ids = new Set(newSparks.map((s) => s.id))
      setSparks((prev) => prev.filter((s) => !ids.has(s.id)))
    }, SPARK_LIFETIME_MS)
  }, [originRef])

  return { shaking, flash, sparks, fire }
}
