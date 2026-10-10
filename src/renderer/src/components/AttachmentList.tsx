import type { ComposerAttachment } from '../hooks/useAttachments'

interface AttachmentListProps {
  attachments: ComposerAttachment[]
  onRemove: (localId: string) => void
  onDescriptionChange: (localId: string, value: string) => void
  /** Altテキスト入力欄からフォーカスが外れたとき（サーバーへ反映するタイミング） */
  onDescriptionBlur: (localId: string) => void
}

/** 添付画像のプレビューと Alt テキスト入力欄の一覧 */
export default function AttachmentList({
  attachments,
  onRemove,
  onDescriptionChange,
  onDescriptionBlur
}: AttachmentListProps) {
  if (attachments.length === 0) return null

  return (
    <div className="attachments-row">
      {attachments.map((a) => (
        <div key={a.localId} className={`attachment-item ${a.uploading ? 'uploading' : ''}`}>
          <div className="attachment-preview">
            <img src={a.previewUrl} alt="" />
            {a.uploading && <div className="attachment-spinner">アップロード中…</div>}
            <button
              type="button"
              className="attachment-remove-btn"
              onClick={() => onRemove(a.localId)}
              title="添付を削除"
            >
              ✕
            </button>
          </div>
          <input
            type="text"
            className="attachment-alt-input"
            value={a.description}
            onChange={(e) => onDescriptionChange(a.localId, e.target.value)}
            onBlur={() => onDescriptionBlur(a.localId)}
            placeholder="Altテキスト（画像の説明）"
            maxLength={1500}
            disabled={a.uploading}
          />
          {a.error && <span className="attachment-error">{a.error}</span>}
        </div>
      ))}
    </div>
  )
}
