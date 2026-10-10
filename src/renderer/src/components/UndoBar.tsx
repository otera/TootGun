interface UndoBarProps {
  /** カウントダウンの長さ。アニメーションの duration に使う */
  windowMs: number
  busy: boolean
  /** redraft が true なら削除後に本文を編集し直す */
  onUndo: (redraft: boolean) => void
}

/** 投稿直後に表示される取り消しバー。カウントダウンが終わると親側で非表示になる */
export default function UndoBar({ windowMs, busy, onUndo }: UndoBarProps) {
  return (
    <div className="undo-bar">
      <div className="undo-countdown" style={{ animationDuration: `${windowMs}ms` }} />
      <span className="undo-label">着弾確認</span>
      <div className="undo-actions">
        <button
          className="undo-btn"
          onClick={() => onUndo(false)}
          disabled={busy}
          title="直前のTootを削除"
        >
          🗑 取消
        </button>
        <button
          className="undo-btn edit"
          onClick={() => onUndo(true)}
          disabled={busy}
          title="直前のTootを削除して本文を編集し直す"
        >
          ✏️ 取消して編集
        </button>
      </div>
    </div>
  )
}
