import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Live from './pages/Live'
import RoomView from './pages/RoomView'
import Minutes from './pages/Minutes'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/live" element={<Live />} />
      <Route path="/m/:id" element={<RoomView />} />
      <Route path="/minutes/:id" element={<Minutes />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
