import { Routes, Route } from 'react-router-dom'
import Shell from './pages/Shell'
import Live from './pages/Live'
import RoomView from './pages/RoomView'
import Minutes from './pages/Minutes'
import Settings from './pages/Settings'
import Archived from './pages/Archived'
import Folders from './pages/Folders'
import Recordings from './pages/Recordings'
import Diagnostics from './pages/Diagnostics'
import Import from './pages/Import'
import Record from './pages/Record'
import AISettings from './pages/AISettings'
import About from './pages/About'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Shell />} />
      <Route path="/live" element={<Live />} />
      <Route path="/m/:id" element={<RoomView />} />
      <Route path="/minutes/:id" element={<Minutes />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/settings/archived" element={<Archived />} />
      <Route path="/settings/folders" element={<Folders />} />
      <Route path="/settings/recordings" element={<Recordings />} />
      <Route path="/settings/diagnostics" element={<Diagnostics />} />
      <Route path="/import" element={<Import />} />
      <Route path="/record" element={<Record />} />
      <Route path="/settings/ai" element={<AISettings />} />
      <Route path="/about" element={<About />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
