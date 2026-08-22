import { useState } from 'react'
import { disableSharing, enableSharing, shareUrl } from '../lib/share'
import type { Tree } from '../lib/supabase'

// FR-5.1: bật/tắt/tạo lại link chia sẻ chỉ-xem. Modal này chỉ ghi cột
// trees.share_token qua policy owner-update sẵn có (migration 0001) — không
// tự thực thi gì về phần "chỉ-xem", đó là việc của RLS + get_shared_tree
// (migration 0004_share_link.sql) và của TreeView (readOnlyData, ẩn nút sửa/xóa).
export function ShareModal({
  tree,
  onClose,
  onChanged,
}: {
  tree: Tree
  onClose: () => void
  onChanged: (tree: Tree) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const link = tree.share_token ? shareUrl(tree.share_token) : null

  async function handleEnable(confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) return
    setBusy(true)
    setError(null)
    try {
      const token = await enableSharing(tree.id)
      onChanged({ ...tree, share_token: token })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo link thất bại.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    if (!window.confirm('Tắt chia sẻ? Link hiện tại sẽ ngừng hoạt động ngay.')) return
    setBusy(true)
    setError(null)
    try {
      await disableSharing(tree.id)
      onChanged({ ...tree, share_token: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tắt chia sẻ thất bại.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-stone-800">Chia sẻ cây</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700" aria-label="Đóng">
            ✕
          </button>
        </div>

        {link ? (
          <>
            <p className="mb-3 text-sm text-stone-600">
              Ai có link này xem được cây — không thấy nút sửa/xóa, và không sửa/xóa được gì dù cố tình.
            </p>
            <div className="mb-3 flex gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                className="flex-1 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
              />
              <button
                onClick={handleCopy}
                className="shrink-0 rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
              >
                {copied ? 'Đã chép' : 'Chép link'}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleEnable('Tạo link mới sẽ làm link cũ ngừng hoạt động. Tiếp tục?')}
                disabled={busy}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
              >
                Tạo link mới
              </button>
              <button
                onClick={handleDisable}
                disabled={busy}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Tắt chia sẻ
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-stone-600">
              Chưa chia sẻ. Tạo link để họ hàng xem cây — họ chỉ xem được, không sửa/xóa được gì.
            </p>
            <button
              onClick={() => handleEnable()}
              disabled={busy}
              className="rounded-md bg-stone-800 px-4 py-1.5 text-sm text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {busy ? 'Đang tạo…' : 'Tạo link chia sẻ'}
            </button>
          </>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
