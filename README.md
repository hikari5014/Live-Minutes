# Live Minutes

> 跨裝置（手機）雙語即時字幕 + 後端 AI 會議記錄 PWA · GitHub → Cloudflare

一款可「加入手機桌面」的漸進式網頁應用（PWA）：開會時**即時聽打**、標記**發言者**、同步顯示**雙語字幕**（外語→中文，或**中文→外語即時口譯**）；把**分享連結**傳給同事，連**外國同事**都能看自己語言的字幕即時參與。會議結束後**可選擇**讓 AI 整理成**結構化會議紀錄**，可讀、可下載、可回看。

## 快速開始

```bash
npm install
npm run dev        # http://localhost:5173 — 純前端即可用 Web Speech 即時字幕
```

完整全端（房間、翻譯、AI 紀錄）與部署到 Cloudflare，見 **[DEPLOY.md](DEPLOY.md)**。

## 目前狀態

- ✅ 前端 PWA：可安裝、即時字幕（Web Speech，零後端）、語言模式、設定開關、分享 UI、AI 紀錄頁
- ✅ 後端 Worker：Durable Object 房間（WS 中繼 + 廣播）、D1 儲存、DeepL / Gemini / Deepgram 串接
- ✅ **已部署上線**：<https://live-minutes.mark-lu.workers.dev>（D1 已建表；DeepL、Gemini 已設定並線上實測通過；Deepgram 需 owner 權限金鑰才能簽發臨時 token）

前端與後端皆通過建置與型別檢查；`wrangler --dry-run` 綁定驗證通過。線上端點 `health / translate / minutes` 與 SPA 分享路由實測正常。

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
