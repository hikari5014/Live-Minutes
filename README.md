# Live Minutes

> 跨裝置（手機）雙語即時字幕 + 後端 AI 會議記錄 PWA

一款可「加入手機桌面」的漸進式網頁應用（PWA）：開會時**即時聽打**、標記**發言者**、同步顯示**繁體中文**雙語字幕；會議結束後，AI 自動整理成**結構化會議紀錄**，可讀、可下載、可跨裝置共享。

## 📄 產品與技術計劃書

完整評估、修正後架構、免費額度分析、手機 UI 與視覺設計、開發路線圖：

**➡️ [`docs/live-minutes-plan.html`](docs/live-minutes-plan.html)**

用瀏覽器開啟即可閱讀（自包含單檔、支援深/淺色主題、手機可讀）。

## 核心結論

- **可行性：8.5 / 10** — 方向與選型正確，需要 **1 處架構修正**。
- **關鍵修正：** Vercel **不能**跑 WebSocket 伺服器來中繼音訊。改為讓瀏覽器**直連 Deepgram**（用 Vercel 函式核發臨時金鑰），Vercel 只做輕量 Serverless Functions。
- **月固定成本：** 在免費額度內可為 **US$0**；唯一長期變數是 Deepgram 一次性 US$200 額度用罄後的分鐘計費。

## 技術堆疊

| 層 | 選型 | 角色 |
| --- | --- | --- |
| 前端 | React / Tailwind CSS · PWA | 麥克風擷取（AudioWorklet / 16kHz PCM）、雙語字幕、Wake Lock |
| 託管 | Vercel（Hobby） | 靜態網頁 + 短請求 Serverless Functions |
| 語音辨識 | Deepgram（瀏覽器直連） | 串流 ASR + 語者分離；Web Speech API 作零成本備援 |
| 翻譯 | DeepL API（Free） | 英/多語 → 繁體中文（只翻定稿句以省額度） |
| 資料庫 | Supabase（可經 Vercel Marketplace 佈建） | Postgres 儲存 + Realtime 跨裝置同步 + Auth |
| 會議紀錄 | Gemini 2.5 Flash | 逐字稿 → 結構化繁中會議紀錄 |

## 建議架構（修正後）

```
① 手機 PWA ──(音訊 WebSocket 直連, 臨時金鑰)──▶ Deepgram (ASR + 語者分離)
   │
   ├─(HTTPS)──▶ Vercel /api/translate ──▶ DeepL (繁中)
   ├─(HTTPS)──▶ Vercel /api/token     ──▶ 核發 Deepgram 臨時金鑰
   ├─(HTTPS)──▶ Vercel /api/minutes   ──▶ Gemini 2.5 Flash (會議紀錄)
   └───────────▶ Supabase (逐句儲存 + Realtime 廣播給其他裝置)
```

> 重點：**音訊不經過 Vercel**（避開長連線限制），文字翻譯與紀錄生成才走 Vercel 短請求函式。

## 開發路線圖

- **Phase 0** — PWA 骨架 + 麥克風 + Web Speech API 驗證體驗（零成本）
- **Phase 1** — Deepgram 直連 + 語者分離
- **Phase 2** — DeepL 雙語字幕 + Supabase 儲存
- **Phase 3** — Gemini AI 會議紀錄（**MVP 完成**）
- **Phase 4** — Supabase Realtime 跨裝置同步 + 帳號 + 打磨

---

_目前內容為規劃階段產物；程式實作尚未開始。_
