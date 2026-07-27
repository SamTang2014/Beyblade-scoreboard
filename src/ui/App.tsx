import { useRoute } from '../lib/router'
import { Home } from './Home'
import { Setup } from './Setup'
import { Console } from './Console'
import { Schedule } from './Schedule'
import { Table } from './Table'
import { Matrix } from './Matrix'
import { Bracket } from './Bracket'
import { Board } from './Board'

export function App() {
  const route = useRoute()

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
    </div>
  )
}
