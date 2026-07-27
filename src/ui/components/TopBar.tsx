import type { Route } from '../../lib/router'

const TABS: { name: Route['name']; label: string }[] = [
  { name: 'console', label: '入分' },
  { name: 'schedule', label: '賽程' },
  { name: 'table', label: '排名' },
  { name: 'matrix', label: '矩陣' },
  // 唔用「投屏」—— 嗰個係大陸講法，同成個介面嘅廣東話口語唔夾。
  { name: 'board', label: '電視' },
]

export function TopBar({ id, name, current }: { id: string; name: string; current: Route['name'] }) {
  return (
    <header className="topbar">
      <a className="navlink" href="#/" aria-label="返主頁">
        ←
      </a>
      <h1 className="topbar__name">{name}</h1>
      <div className="topbar__spacer" />
      <nav className="topbar__nav" aria-label="賽事畫面">
        {TABS.map((tab) => (
          <a
            key={tab.name}
            className="navlink"
            href={tab.name === 'console' ? `#/t/${id}` : `#/t/${id}/${tab.name}`}
            aria-current={tab.name === current ? 'page' : undefined}
          >
            {tab.label}
          </a>
        ))}
      </nav>
    </header>
  )
}
