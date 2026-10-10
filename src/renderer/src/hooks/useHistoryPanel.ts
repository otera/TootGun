import { useCallback, useEffect, useRef, useState } from 'react'

const MAIN_WIDTH = 400
const HANDLE_WIDTH = 5
const MIN_HISTORY_WIDTH = 180
const MAX_HISTORY_WIDTH = 600
const DEFAULT_HISTORY_WIDTH = 280

/**
 * 投稿ログパネルの開閉と幅を管理する。
 * パネルを開くとウィンドウ幅そのものを広げる（本文エリアの幅は変えない）。
 */
export function useHistoryPanel() {
  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(DEFAULT_HISTORY_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const widthRef = useRef(DEFAULT_HISTORY_WIDTH)

  useEffect(() => {
    window.api.store.get('historyOpen').then(async (saved) => {
      if (!saved) return
      setOpen(true)
      await window.api.window.setWidth(MAIN_WIDTH + HANDLE_WIDTH + DEFAULT_HISTORY_WIDTH)
    })
  }, [])

  const toggle = async () => {
    await window.api.store.set('historyOpen', !open)
    if (!open) {
      await window.api.window.setWidth(MAIN_WIDTH + HANDLE_WIDTH + widthRef.current)
      setOpen(true)
    } else {
      setOpen(false)
      await window.api.window.setWidth(MAIN_WIDTH)
    }
  }

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = widthRef.current
    setIsResizing(true)
    document.body.style.cursor = 'col-resize'

    const onMove = (e: MouseEvent) => {
      const diff = startX - e.clientX
      const newWidth = Math.max(MIN_HISTORY_WIDTH, Math.min(MAX_HISTORY_WIDTH, startWidth + diff))
      widthRef.current = newWidth
      setWidth(newWidth)
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

  return { open, width, isResizing, toggle, handleResizeMouseDown }
}
