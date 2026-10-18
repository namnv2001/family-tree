import { useEffect, useState } from 'react'
import { editable, loadTree } from './lib/store'
import { PeoplePage } from './components/PeoplePage'
import { TreeView } from './components/TreeView'

export default function App() {
  const [name, setName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'tree' | 'list'>('tree')

  useEffect(() => {
    loadTree()
      .then((tree) => setName(tree.name))
      .catch((err) => setError(err instanceof Error ? err.message : 'Không tải được cây.'))
  }, [])

  if (error) return <Center><p className="text-red-600">{error}</p></Center>
  if (name === null) return <Center>Đang tải cây…</Center>

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-200 px-4 py-3">
        <h1 className="font-semibold text-stone-800">{name}</h1>
        {editable && (
          <nav aria-label="Chế độ xem" className="flex gap-1 text-sm">
            <TabButton active={tab === 'tree'} onClick={() => setTab('tree')}>
              Cây
            </TabButton>
            <TabButton active={tab === 'list'} onClick={() => setTab('list')}>
              Danh sách
            </TabButton>
          </nav>
        )}
      </header>
      <main className="flex flex-1 flex-col overflow-hidden">
        {tab === 'tree' ? <TreeView /> : <PeoplePage />}
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
