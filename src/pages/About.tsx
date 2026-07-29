import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { ChevronLeft } from '../components/icons'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-1 text-[13px] font-extrabold text-ink">{title}</div>
      <div className="text-[12.5px] leading-relaxed text-body">{children}</div>
    </section>
  )
}

export default function About() {
  const nav = useNavigate()
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar subtitle="關於 · 隱私" />
      <main className="safe-b mx-auto w-full max-w-md flex-1 px-4 pb-12">
        <button onClick={() => nav('/settings')} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ChevronLeft className="h-4 w-4" />
          設定
        </button>
        <h1 className="mb-4 mt-2 text-xl font-extrabold text-ink">關於與資料說明</h1>
        <div className="grid gap-3">
          <Card title="這是什麼">
            Live Minutes 是跨裝置的即時字幕與 AI 會議紀錄 PWA：可安裝到手機桌面，開會即時聽打、翻譯、分享連結，會後生成結構化紀錄。
          </Card>
          <Card title="你的資料存在哪">
            會議標題、逐字稿與紀錄<b>預設只存在你這台裝置的瀏覽器</b>（localStorage）。啟用「雲端備份」後，才會用你的備份碼存到你自己的 Cloudflare
            D1。分享房間時，逐字稿會暫存在該場會議的 Durable Object，散會後寫入 D1。
          </Card>
          <Card title="錄音檔（重要）">
            開啟「錄音存檔」後，會議音訊會錄下並<b>只存在這台裝置</b>（IndexedDB），不會自動上傳，也不會進入雲端備份。
            <ul className="ml-4 mt-1.5 grid list-disc gap-1">
              <li>只有你按下「產生權威版逐字稿」時，音檔才會<b>短暫上傳</b>給 Gemini 辨識；我們的伺服器不留存音檔。</li>
              <li>可在「設定 → 錄音」設定<b>保留期限</b>（預設 30 天後自動刪除音檔，逐字稿與紀錄保留）。</li>
              <li>可隨時單場刪除或匯出。清除瀏覽器資料會一併刪除未匯出的錄音。</li>
              <li>錄音前請確認已取得與會者同意——這是你的責任。</li>
            </ul>
          </Card>
          <Card title="會用到哪些第三方服務">
            <ul className="ml-4 grid list-disc gap-1">
              <li>
                <b>Deepgram</b>：啟用高品質辨識或多語言偵測時，麥克風音訊會即時串流到 Deepgram 轉成文字。
              </li>
              <li>
                <b>DeepL</b>：需要翻譯時，定稿句子的文字會送到 DeepL。
              </li>
              <li>
                <b>Google Gemini</b>：生成 AI 紀錄時，逐字稿會送到 Gemini。
              </li>
            </ul>
            <p className="mt-1.5">若使用純瀏覽器字幕（Web Speech）、不翻譯、不生成紀錄，文字不會送往上述服務。</p>
          </Card>
          <Card title="刪除與匯出">
            首頁左滑會議可刪除、右滑可封存或移動到資料夾；設定內可管理封存與資料夾、匯出/匯入檔案備份。清除瀏覽器資料會移除本機所有內容（未備份將無法復原）。
          </Card>
          <Card title="安全提醒">
            備份碼等同存取權，請勿外流。分享連結的任何人都能觀看該場字幕，請只分享給需要的人。
          </Card>
        </div>
        <p className="mt-6 text-center text-[11px] text-faint">Live Minutes · v{__APP_VERSION__}</p>
      </main>
    </div>
  )
}
