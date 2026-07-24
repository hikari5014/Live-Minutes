import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-dvh grid place-items-center p-6 text-center">
      <div>
        <div className="text-xl font-bold text-ink">找不到頁面</div>
        <Link to="/" className="mt-3 inline-block text-brand-ink font-semibold">回首頁</Link>
      </div>
    </div>
  )
}
