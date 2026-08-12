import { useRoute } from '../lib/router'
import { useTheme } from '../lib/useTheme'
import { Home } from './Home'
import { Setup } from './Setup'
import { Console } from './Console'
import { Schedule } from './Schedule'
import { Table } from './Table'
import { Matrix } from './Matrix'
import { Bracket } from './Bracket'
import { Board } from './Board'
import { Parts } from './Parts'

export function App() {
  const route = useRoute()
  // 喺最頂叫一次：落 class、聽住部機嘅日夜轉。個 picker 淨係喺主頁出現，
  // 得佢叫嘅話，你企喺入分版天黑咗都唔會跟。
  useTheme()

  return (
    <div className="app">
      {route.name === 'home' && <Home />}
      {route.name === 'setup' && <Setup key={route.id} id={route.id} />}
      {route.name === 'console' && (
        <Console key={`${route.id}/${route.matchId ?? ''}`} id={route.id} matchId={route.matchId} />
      )}
      {route.name === 'schedule' && <Schedule key={route.id} id={route.id} />}
      {route.name === 'table' && <Table key={route.id} id={route.id} />}
      {route.name === 'matrix' && <Matrix key={route.id} id={route.id} />}
      {route.name === 'bracket' && <Bracket key={route.id} id={route.id} />}
      {route.name === 'board' && <Board key={route.id} id={route.id} />}
      {route.name === 'parts' && <Parts key={route.id ?? '@all'} id={route.id} />}
    </div>
  )
}
