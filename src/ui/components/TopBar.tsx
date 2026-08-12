import { ThemeToggle } from './Theme'
import type { Route } from '../../lib/router'
import type { TournamentMode } from '../../engine/types'

type TabName = Extract<
  Route['name'],
  'console' | 'schedule' | 'table' | 'matrix' | 'bracket' | 'board' | 'parts'
>

const TABS: { name: TabName; label: string }[] = [
  { name: 'console', label: '入分' },
  { name: 'schedule', label: '賽程' },
  { name: 'table', label: '排名' },
  { name: 'matrix', label: '矩陣' },
  { name: 'bracket', label: '籤表' },
  // 唔用「投屏」—— 嗰個係大陸講法，同成個介面嘅廣東話口語唔夾。
  { name: 'board', label: '電視' },
  { name: 'parts', label: '零件' },
]

/**
 * 邊幾個 tab 睇模式。
 *
 * 純淘汰冇「賽程」「排名」「矩陣」—— 淘汰賽唔係逐輪人人都打，
 * 亦都分唔到第 3 名（因為唔做季軍戰）。show 埋出嚟只會誤導。
 */
function tabsFor(mode: TournamentMode): { name: TabName; label: string }[] {
  return TABS.filter((tab) => {
    // 「循環 + 淘汰」喺籤表未砌之前都要見到呢個 tab ——
    // 唔係用戶根本冇路入去撳「砌籤表」。
    if (tab.name === 'bracket') return mode !== 'roundRobin'
    // 「零件」查嘅係零件資料庫，同賽制無關 —— 邊個模式都要見到。
    if (tab.name === 'parts') return true
    if (mode !== 'knockout') return true
    return tab.name === 'console' || tab.name === 'board'
  })
}

export function TopBar({
  id,
  name,
  current,
  mode = 'roundRobin',
}: {
  id: string
  name: string
  current: Route['name']
  mode?: TournamentMode
}) {
  return (
    <header className="topbar">
      <a className="navlink" href="#/" aria-label="返主頁">
        ←
      </a>
      <h1 className="topbar__name">{name}</h1>
      <div className="topbar__spacer" />
      <ThemeToggle />
      <nav className="topbar__nav" aria-label="賽事畫面">
        {tabsFor(mode).map((tab) => (
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
