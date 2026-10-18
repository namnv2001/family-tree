import { useState } from 'react'
import { photoUrl } from '../lib/photos'

export function Avatar({
  photoPath,
  name,
  size = 40,
  grayscale = false,
}: {
  photoPath: string | null
  name: string
  size?: number
  grayscale?: boolean
}) {
  const [failedPath, setFailedPath] = useState<string | null>(null)
  const url = photoPath && photoPath !== failedPath ? photoUrl(photoPath) : null

  const initial = name.trim().charAt(0).toUpperCase() || '?'
  const style = { width: size, height: size, fontSize: size * 0.4 }

  // FR-1.3 AC: không có ảnh (hoặc chưa tải xong) → chữ cái đầu, không bao giờ hiện ô ảnh vỡ.
  if (!url) {
    return (
      <div
        style={style}
        className="grid shrink-0 place-items-center rounded-full bg-stone-300 font-semibold text-stone-700"
      >
        {initial}
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={name}
      style={style}
      onError={() => setFailedPath(photoPath)}
      className={`shrink-0 rounded-full object-cover ${grayscale ? 'grayscale' : ''}`}
    />
  )
}
