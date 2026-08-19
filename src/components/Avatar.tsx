import { useEffect, useState } from 'react'
import { getPhotoUrl } from '../lib/photos'

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
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    setUrl(null)
    if (!photoPath) return
    let live = true
    getPhotoUrl(photoPath).then((resolved) => {
      if (live) setUrl(resolved)
    })
    return () => {
      live = false
    }
  }, [photoPath])

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
      onError={() => setUrl(null)}
      className={`shrink-0 rounded-full object-cover ${grayscale ? 'grayscale' : ''}`}
    />
  )
}
