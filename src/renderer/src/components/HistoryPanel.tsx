import type { PostHistory } from '../types'
import { formatTime } from '../utils/formatTime'

const PREVIEW_LENGTH = 120

interface HistoryPanelProps {
  posts: PostHistory[]
  width: number
  isResizing: boolean
  onResizeMouseDown: (e: React.MouseEvent) => void
  onClose: () => void
}

/** 投稿ログのサイドパネル（MPlayer のプレイリスト風）。左端のハンドルで幅を変えられる */
export default function HistoryPanel({
  posts,
  width,
  isResizing,
  onResizeMouseDown,
  onClose
}: HistoryPanelProps) {
  return (
    <>
      <div
        className={`resize-handle ${isResizing ? 'dragging' : ''}`}
        onMouseDown={onResizeMouseDown}
      />
      <div className="history-panel" style={{ width }}>
        <div className="history-panel-header">
          <span className="history-panel-title">AMMO LOG</span>
          <button className="history-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="history-list">
          {posts.length === 0 && <div className="history-empty">NO AMMO</div>}
          {posts.map((p, i) => (
            <div key={i} className={`history-item ${i === 0 ? 'latest' : ''}`}>
              <span className="history-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="history-content">
                <span className="history-text">
                  {p.text.slice(0, PREVIEW_LENGTH)}
                  {p.text.length > PREVIEW_LENGTH ? '…' : ''}
                </span>
                <span className="history-time">{formatTime(p.time)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
