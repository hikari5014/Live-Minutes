# Live Minutes

> 跨裝置（手機）雙語即時字幕 + 後端 AI 會議記錄 PWA · GitHub → Cloudflare

一款可「加入手機桌面」的漸進式網頁應用（PWA）：開會時**即時聽打**、標記**發言者**、同步顯示**雙語字幕**（外語→中文，或**中文→外語即時口譯**）；把**分享連結**傳給同事，連**外國同事**都能看自己語言的字幕即時參與。會議結束後**可選擇**讓 AI 整理成**結構化會議紀錄**，可讀、可下載、可回看。

## 快速開始

```bash
npm install
npm run dev        # http://localhost:5173 — 純前端即可用 Web Speech 即時字幕
```

完整全端（房間、翻譯、AI 紀錄）與部署到 Cloudflare，見 **[DEPLOY.md](DEPLOY.md)**。

## 目前狀態 · v1.0.0 已上線

**➡️ <https://live-minutes.mark-lu.workers.dev>**（手機開啟 → 加入主畫面即為 App）

前後端皆通過 typecheck、`npm test`（15 項單元測試）、線上端點實測。已完成：

- **即時字幕**：Web Speech（免費）＋ Deepgram（高品質＋語者分離）自動切換、斷線自動重連；iOS 優先走 Deepgram。
- **語言模式**：外語→中文、中文→外語、純逐字稿不翻，及**多語言自動偵測→中文**（需 Deepgram，未啟用會擋下並提示）。
- **翻譯**：DeepL，可設定分段長度/頻率省額度；額度快用盡會警示。
- **會議房間**：Durable Object 中繼＋每位觀看者自選語言；**觀看者介面依瀏覽器語言在地化**（中/英/日/韓/德/法/西）。
- **AI 紀錄**：Gemini 結構化輸出、**長逐字稿自動分段 map-reduce**、可選輸出語言、可重新生成。
- **可編輯**：改標題、命名發言者、修逐字稿。
- **會議管理**：滑動封存/刪除（可復原）/釘選/移動、分類資料夾、搜尋（標題＋逐字稿）。
- **可靠性**：錄音中自動存草稿、重開自動救回；API 同源限制＋每 IP 限流保護額度。
- **雲端備份（B 方案）**：用備份碼把會議存到 D1、換裝置還原；另可匯出/匯入 JSON 檔。
- **PWA**：可安裝、離線殼、Wake Lock、暫停/繼續錄音、隱私說明頁、首次引導。
- **錄音與音檔優先紀錄（純中文方案）**：一鍵「純中文會議」預設；錄音分段存於本機 IndexedDB（可播放/匯出/自動清理）；
  會後把錄音交給 Gemini 產出**權威版逐字稿**（補標點、去贅字、繁體、真實人名），保留即時版可還原；
  **點逐字稿時間即可回放**該段錄音；與會者名單與術語表同時提升聽寫與待辦歸屬準確度；設定 → 診斷 可實測裝置配額與錄音格式。

## 語言模式與會議開關

每場會議可自由設定「來源語言 → 字幕語言」與幾個開關：

| 模式 | 設定 | 用途 | 省額度 |
| --- | --- | --- | --- |
| **不翻譯 · 純逐字稿** | 中文 → 中文 | 純中文會議只要逐字稿與紀錄 | DeepL 歸零 |
| **外語 → 繁中** | 英/日/… → 繁中 | 看懂外語會議（原始用途） | — |
| **中文 → 外語（即時口譯）** | 中文 → 英/日/… | 分享連結給外國同事即時參與中文會議 | — |

- **語者分離**、**會後 AI 紀錄** 都是每場會議的開關；不需要總結時關掉紀錄可省 Gemini 額度。
- **每位觀看者可自選字幕語言**；房間每種語言只翻一次再分送——加人不加成本、加的是語言種數。

## 技術堆疊

| 層 | 選型 |
| --- | --- |
| 前端 | React · TypeScript · Vite · Tailwind CSS · vite-plugin-pwa |
| 託管 | Cloudflare Worker（Static Assets 託管前端 `dist/`） |
| 即時房間 | Cloudflare **Durable Objects**（WS 中繼 + 字幕廣播 + Hibernation） |
| 資料庫 | Cloudflare **D1**（sessions / utterances / minutes） |
| 語音辨識 | Web Speech API（免費預設）· Deepgram（選用，短效金鑰） |
| 翻譯 | DeepL API（只翻定稿句 · 同語言去重） |
| 會議紀錄 | Google Gemini 2.5 Flash（結構化繁中 JSON） |

## 專案結構

```
├─ docs/live-minutes-plan.html   # 產品與技術計劃書（可直接開）
├─ index.html · src/             # 前端 PWA
│  ├─ pages/    Home · Live · RoomView · Minutes
│  ├─ components/  TopBar · Toggle · Select · Wave · Captions · ShareSheet · icons
│  ├─ lib/      engine · asr · audio · room · api · protocol · langs · minutes · qr · theme …
│  └─ state/    store（zustand）
├─ worker/                       # Cloudflare Worker
│  ├─ index.ts  路由（/api/*、WS、SPA fallback）
│  ├─ room.ts   MeetingRoom Durable Object
│  └─ deepl · gemini · deepgram · db · protocol · langs
├─ schema.sql · wrangler.toml · .dev.vars.example
└─ DEPLOY.md
```

## npm scripts

| 指令 | 說明 |
| --- | --- |
| `npm run dev` | Vite 開發伺服器（純前端） |
| `npm run build` | 型別檢查 + 建置前端到 `dist/` |
| `npm run typecheck` | 前端 + Worker 型別檢查 |
| `npm run worker:dev` | 本機全端（wrangler dev，模擬 DO + D1，免登入） |
| `npm run db:init` | 在 D1 建立資料表 |
| `npm run deploy` | 建置並部署到 Cloudflare |

## 產品與技術計劃書

完整評估、架構、免費額度、會議房間、UI 與視覺設計、路線圖：
**➡️ [`docs/live-minutes-plan.html`](docs/live-minutes-plan.html)**

針對**純中文會議**的音檔優先方案（錄音保存 → Gemini 產生權威版逐字稿與紀錄、多人語者處理、成本與風險）：
**➡️ [`docs/chinese-minutes-plan.html`](docs/chinese-minutes-plan.html)**
