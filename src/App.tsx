import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Tree } from './lib/supabase'
import { PeoplePage } from './components/PeoplePage'
import { TreeView } from './components/TreeView'

export default function App() {
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
      <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold text-stone-800">{tree.name}</h1>
          <nav className="flex gap-1 text-sm">
            <TabButton active={tab === 'tree'} onClick={() => setTab('tree')}>
              Cây
            </TabButton>
            <TabButton active={tab === 'list'} onClick={() => setTab('list')}>
              Danh sách
            </TabButton>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <span>{session.user.email}</span>
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
