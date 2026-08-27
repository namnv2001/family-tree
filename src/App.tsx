import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSharedTree, type SharedTree } from './lib/share'
import { supabase, type Tree } from './lib/supabase'
import { PeoplePage } from './components/PeoplePage'
import { ShareModal } from './components/ShareModal'
import { TreeView } from './components/TreeView'

// FR-5.1: link chia sẻ dùng query param (?share=<token>), không phải path
// riêng — SPA này chỉ có 1 file index.html, path khác `/` sẽ 404 trên hầu
// hết static host trừ khi cấu hình rewrite; query param thì chạy được ngay
// không cần đụng gì tới hosting. Đọc MỘT LẦN lúc module load (không phải
// trong component, để giá trị không đổi qua các re-render, và bỏ qua toàn bộ
// luồng đăng nhập — khách xem link không cần tài khoản).
const shareToken = new URLSearchParams(window.location.search).get('share')

export default function App() {
  // Dispatch thuần, không hook — nhánh đăng nhập (AuthGate) mới là nơi gọi
  // hook. `shareToken` cố định suốt đời App nên nhánh này tự nó không đổi
  // giữa các lần render, nhưng tách hẳn ra component riêng vẫn an toàn hơn
  // là early-return TRƯỚC lời gọi hook trong cùng một component (rules of
  // hooks yêu cầu thứ tự hook gọi giống nhau mọi lần render — tách riêng thì
  // khỏi phải chứng minh điều đó, đọc code cũng rõ ý hơn).
  return shareToken ? <SharedApp token={shareToken} /> : <AuthGate />
}

function AuthGate() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    )
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return <Center>Đang tải…</Center>
  if (!session) return <SignIn />
  return <Home session={session} />
}

// FR-5.1: trang cho khách mở link chia sẻ — không đăng nhập, không có nút
// sửa/xóa nào (TreeView nhận readOnlyData thay vì treeId → tự ẩn hết, xem
// TreeView.tsx). Tải dữ liệu MỘT LẦN qua RPC get_shared_tree lúc mount, không
// tự fetch lại gì thêm sau đó (không có quyền, và cây chia sẻ không cần tự lưu).
function SharedApp({ token }: { token: string }) {
  const [data, setData] = useState<SharedTree | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSharedTree(token)
      .then((result) => (result ? setData(result) : setInvalid(true)))
      .catch((err) => setError(err instanceof Error ? err.message : 'Không tải được cây.'))
  }, [token])

  if (error) return <Center><p className="text-red-600">{error}</p></Center>
  if (invalid)
    return (
      <Center>
        <p className="text-stone-600">Link không hợp lệ, hoặc chủ cây đã tắt chia sẻ.</p>
      </Center>
    )
  if (!data) return <Center>Đang tải cây…</Center>

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-stone-200 px-4 py-3">
        <h1 className="font-semibold text-stone-800">{data.tree.name}</h1>
        <p className="text-xs text-stone-500">Xem qua link chia sẻ — chỉ xem, không sửa/xóa được.</p>
      </header>
      <main className="flex flex-1 flex-col overflow-hidden">
        <TreeView readOnlyData={{ people: data.people, relationships: data.relationships }} />
      </main>
    </div>
  )
}

function SignIn() {
  const [error, setError] = useState<string | null>(null)

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setError(error.message)
  }

  return (
    <Center>
      <h1 className="mb-2 text-2xl font-semibold text-stone-800">Cây Gia Phả</h1>
      <p className="mb-6 text-stone-500">Đăng nhập để xem và sửa gia phả.</p>
      <button
        onClick={signIn}
        className="rounded-lg bg-stone-800 px-5 py-2.5 text-white hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-800"
      >
        Đăng nhập bằng Google
      </button>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </Center>
  )
}

function Home({ session }: { session: Session }) {
  const [tree, setTree] = useState<Tree | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'tree' | 'list'>('tree')
  const [shareOpen, setShareOpen] = useState(false)

  // FR-6.2: một cây / một tài khoản, do trigger handle_new_user tạo lúc đăng ký.
  // Không tạo ở client — để chỗ tạo cây chỉ có một.
  useEffect(() => {
    supabase
      .from('trees')
      .select('id, name, share_token')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (!data)
          setError(
            'Tài khoản chưa có cây nào. Kiểm tra migration 0001 đã chạy chưa (trigger on_auth_user_created).',
          )
        else setTree(data)
      })
  }, [])

  if (error) return <Center>{<p className="text-red-600">{error}</p>}</Center>
  if (!tree) return <Center>Đang tải cây…</Center>

  return (
    <div className="flex h-full flex-col">
      {/* NFR mobile: flex-wrap — trên màn hẹp, nhóm phải (chia sẻ/email/đăng
          xuất) tự xuống hàng dưới thay vì tràn ngang ra ngoài khung nhìn (email
          dài + 3 nút + tên cây + 2 tab không bao giờ vừa 1 hàng trên điện thoại). */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-stone-200 px-4 py-3">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold text-stone-800">{tree.name}</h1>
          <nav aria-label="Chế độ xem" className="flex gap-1 text-sm">
            <TabButton active={tab === 'tree'} onClick={() => setTab('tree')}>
              Cây
            </TabButton>
            <TabButton active={tab === 'list'} onClick={() => setTab('list')}>
              Danh sách
            </TabButton>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-stone-500">
          {/* FR-5.1 */}
          <button
            onClick={() => setShareOpen(true)}
            className="rounded-md border border-stone-300 px-3 py-1.5 hover:bg-stone-50"
          >
            {tree.share_token ? 'Đang chia sẻ' : 'Chia sẻ'}
          </button>
          {/* Email không phải thông tin thiết yếu để thao tác — ẩn trên màn rất
              hẹp để nhường chỗ cho 2 nút hành động, hiện lại từ sm: trở lên. */}
          <span className="hidden max-w-[180px] truncate sm:inline">{session.user.email}</span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-md border border-stone-300 px-3 py-1.5 hover:bg-stone-50"
          >
            Đăng xuất
          </button>
        </div>
      </header>
      <main className="flex flex-1 flex-col overflow-hidden">
        {tab === 'tree' ? <TreeView treeId={tree.id} /> : <PeoplePage treeId={tree.id} />}
      </main>
      {shareOpen && (
        <ShareModal tree={tree} onClose={() => setShareOpen(false)} onChanged={setTree} />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`rounded-md px-3 py-1.5 ${active ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
    >
      {children}
    </button>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-6 text-center text-stone-600">
      <div>{children}</div>
    </div>
  )
}
