import { useState } from 'react'

export default function HashtagPanel({ hashtags, activeHashtags, onChange }) {
  const [adding, setAdding] = useState(false)
  const [newTag, setNewTag] = useState('')

  const toggleTag = (tag) => {
    const next = activeHashtags.includes(tag)
      ? activeHashtags.filter(t => t !== tag)
      : [...activeHashtags, tag]
    onChange(hashtags, next)
  }

  const addTag = (e) => {
    e.preventDefault()
    const tag = newTag.replace(/^#/, '').trim()
    if (!tag || hashtags.includes(tag)) {
      setNewTag('')
      setAdding(false)
      return
    }
    const newHashtags = [...hashtags, tag]
    const newActive = [...activeHashtags, tag]
    onChange(newHashtags, newActive)
    setNewTag('')
    setAdding(false)
  }

  const removeTag = (tag, e) => {
    e.stopPropagation()
    const newHashtags = hashtags.filter(t => t !== tag)
    const newActive = activeHashtags.filter(t => t !== tag)
    onChange(newHashtags, newActive)
  }

  return (
    <div className="hashtag-panel">
      <div className="hashtag-list">
        {hashtags.map(tag => (
          <button
            key={tag}
            className={`hashtag-chip ${activeHashtags.includes(tag) ? 'active' : ''}`}
            onClick={() => toggleTag(tag)}
            type="button"
          >
            <span>#{tag}</span>
            <span
              className="hashtag-remove"
              onClick={(e) => removeTag(tag, e)}
              title="削除"
            >×</span>
          </button>
        ))}

        {adding ? (
          <form onSubmit={addTag} className="add-tag-form">
            <input
              autoFocus
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="#タグ"
              className="add-tag-input"
              onBlur={() => { if (!newTag) setAdding(false) }}
            />
          </form>
        ) : (
          <button
            className="add-tag-btn"
            onClick={() => setAdding(true)}
            type="button"
            title="ハッシュタグを追加"
          >
            + タグ
          </button>
        )}
      </div>
    </div>
  )
}
