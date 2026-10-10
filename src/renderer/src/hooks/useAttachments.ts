import { useEffect, useRef, useState } from 'react'

export const MAX_ATTACHMENTS = 4

/** コンポーザー内で管理する画像添付1件分の状態。アップロード完了後にmediaIdが入る */
export interface ComposerAttachment {
  localId: string
  file: File
  previewUrl: string
  description: string
  mediaId?: string
  uploading: boolean
  error?: string
}

/** DataTransfer にファイルが含まれているか（テキストのドラッグでは反応させない） */
const hasFilePayload = (dt: DataTransfer | null) => !!dt && Array.from(dt.types).includes('Files')

/**
 * 画像添付の状態と、ファイル選択・ドラッグ＆ドロップ・ペーストの各入口を管理する。
 * 追加された画像は即座に Mastodon へアップロードし、投稿時には mediaIds を使う。
 */
export function useAttachments() {
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const attachmentsRef = useRef<ComposerAttachment[]>([])
  /** 画像ファイルをウィンドウ上にドラッグ中か（オーバーレイ表示用） */
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  // アンマウント時にプレビュー用の object URL を解放する
  useEffect(() => {
    return () => attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl))
  }, [])

  /** 選択された画像ファイルをMastodonへアップロードし、成功したらmediaIdを反映する */
  const upload = async (localId: string, file: File) => {
    try {
      const data = await file.arrayBuffer()
      const media = await window.api.mastodon.uploadMedia({
        data,
        filename: file.name,
        mimeType: file.type
      })
      setAttachments((prev) =>
        prev.map((a) => (a.localId === localId ? { ...a, mediaId: media.id, uploading: false } : a))
      )
    } catch (err) {
      setAttachments((prev) =>
        prev.map((a) =>
          a.localId === localId ? { ...a, uploading: false, error: (err as Error).message } : a
        )
      )
    }
  }

  /** ファイル選択・ドロップ・ペーストのいずれかで渡された画像を添付に追加する */
  const addFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    const available = MAX_ATTACHMENTS - attachmentsRef.current.length
    const selected = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, Math.max(0, available))

    const added: ComposerAttachment[] = selected.map((file) => ({
      localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      description: '',
      uploading: true
    }))
    if (added.length === 0) return

    setAttachments((prev) => [...prev, ...added])
    added.forEach((a) => upload(a.localId, a.file))
  }

  const remove = (localId: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.localId === localId)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((a) => a.localId !== localId)
    })
  }

  /** 投稿完了後などに全添付を破棄する */
  const clear = () => {
    attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl))
    setAttachments([])
  }

  const setDescription = (localId: string, value: string) => {
    setAttachments((prev) =>
      prev.map((a) => (a.localId === localId ? { ...a, description: value } : a))
    )
  }

  /** Altテキストの入力欄からフォーカスが外れたタイミングでサーバーへ反映する */
  const commitDescription = async (localId: string) => {
    const attachment = attachmentsRef.current.find((a) => a.localId === localId)
    if (!attachment || !attachment.mediaId) return
    try {
      await window.api.mastodon.updateMedia(attachment.mediaId, attachment.description)
    } catch {
      // Altテキストの反映失敗は投稿をブロックしない
    }
  }

  const isFull = attachments.length >= MAX_ATTACHMENTS

  const onDragOver = (e: React.DragEvent) => {
    if (!hasFilePayload(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = isFull ? 'none' : 'copy'
    if (!dragOver) setDragOver(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    // 子要素間の移動でも dragleave が飛ぶので、ウィンドウ外に出た時だけ解除する
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setDragOver(false)
  }

  const onDrop = (e: React.DragEvent) => {
    // Electron はファイルをドロップすると file:// へ遷移しようとするので常に抑止する
    e.preventDefault()
    setDragOver(false)
    if (!hasFilePayload(e.dataTransfer)) return
    addFiles(e.dataTransfer.files)
  }

  /** クリップボードに画像があれば添付として追加する。画像がなければ通常のテキストペーストに任せる */
  const onPaste = (e: React.ClipboardEvent) => {
    const images = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (images.length === 0) return
    e.preventDefault()
    addFiles(images)
  }

  return {
    attachments,
    dragOver,
    isFull,
    isEmpty: attachments.length === 0,
    uploading: attachments.some((a) => a.uploading),
    failed: attachments.some((a) => a.error && !a.mediaId),
    mediaIds: attachments.flatMap((a) => (a.mediaId ? [a.mediaId] : [])),
    addFiles,
    remove,
    clear,
    setDescription,
    commitDescription,
    dragHandlers: { onDragOver, onDragLeave, onDrop },
    onPaste
  }
}
