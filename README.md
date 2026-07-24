# Live Minutes

> 跨裝置（手機）雙語即時字幕 + 後端 AI 會議記錄 PWA

一款可「加入手機桌面」的漸進式網頁應用（PWA）：開會時**即時聽打**、標記**發言者**、同步顯示**雙語字幕**（外語→中文，或**中文→外語即時口譯**）；把**分享連結**傳給同事，連**外國同事**都能看自己語言的字幕即時參與。會議結束後**可選擇**讓 AI 整理成**結構化會議紀錄**，可讀、可下載、可回看。

## 📄 產品與技術計劃書

完整評估、架構、免費額度分析、會議房間分享、手機 UI 與視覺設計、開發路線圖：

**➡️ [`docs/live-minutes-plan.html`](docs/live-minutes-plan.html)**

用瀏覽器開啟即可閱讀（自包含單檔、支援深/淺色主題、手機可讀）。

## 語言模式與會議開關

每場會議可自由設定「來源語言 → 字幕語言」與幾個開關：

| 模式 | 設定 | 用途 | 省額度 |
| --- | --- | --- | --- |
| **不翻譯 · 純逐字稿** | 中文 → 中文 | 純中文會議只要逐字稿與紀錄 | DeepL 歸零 |
| **外語 → 繁中** | 英/日/… → 繁中 | 看懂外語會議（原始用途） | — |
| **中文 → 外語（即時口譯）** | 中文 → 英/日/… | 分享連結給外國同事即時參與中文會議 | — |

- **語者分離**（開/關）、**會後 AI 紀錄**（開/關）都是每場會議的開關；不需要總結時關掉紀錄可省 Gemini 額度。
- **每位觀看者可選自己的字幕語言**；房間每種語言只翻一次再分送——加人不加成本、加的是語言種數。

## 核心結論

- **可行性：9.0 / 10** — 方向與選型正確，改用 Cloudflare 後即成立。
- **關鍵設計：** Vercel 的 serverless **無法**維持長連線 WebSocket；改用 **Cloudflare Durable Objects**——原生支援持久 WebSocket，且「一物件一房間」，一次解決「即時中繼 + 跨裝置同步 + 分享連結」。
- **部署：** 程式碼放 **GitHub**，push 後自動部署到 **Cloudflare**；你和朋友拿到同一個公開網址，隨開即用。
- **月固定成本：** 免費額度內可為 **US$0**；唯一長期變數是 Deepgram 一次性 US$200 額度用罄後的分鐘計費。**觀看者不佔用額外辨識費用。**

## 技術堆疊

| 層 | 選型 | 角色 |
| --- | --- | --- |
| 原始碼 | **GitHub** | 版本控制 + 觸發自動部署 |
| 前端 | React / Tailwind CSS · PWA on **Cloudflare Pages** | 麥克風擷取（AudioWorklet / 16kHz PCM）、雙語字幕、Wake Lock、公開網址 |
| 函式 | **Cloudflare Workers** | 短請求 API：發金鑰 / 翻譯 / 生成紀錄 |
| 即時房間 | **Cloudflare Durable Objects** | 每場會議一個房間：WS 中繼 + 字幕廣播（WebSocket Hibernation 省費） |
| 資料庫 | **Cloudflare D1 / R2** | D1 存逐字稿與紀錄（SQLite）；R2 存選用的錄音檔 |
| 語音辨識 | **Deepgram**（經房間中繼） | 串流 ASR + 語者分離；Web Speech API 作零成本備援 |
| 翻譯 | **DeepL API**（Free） | 英/多語 → 繁體中文（只翻定稿句以省額度） |
| 會議紀錄 | **Gemini 2.5 Flash** | 逐字稿 → 結構化繁中會議紀錄 |

## 架構（GitHub → Cloudflare）

```
GitHub Repo ──push, 自動部署──▶ Cloudflare

① 主持手機 PWA ──WS──▶ Durable Object「房間」──WS──▶ Deepgram (ASR + 語者)
                              │  ▲
                字幕廣播 ◀─────┘  └── 音訊只辨識一次
                    │
   ② 朋友點分享連結 /m/:id ──WS──▶ 同一個房間（唯讀觀看，字幕同步）

Cloudflare Workers ──/api/translate──▶ DeepL (繁中)
                   ──/api/minutes────▶ Gemini 2.5 Flash (會議紀錄)
                   ──▶ D1 / R2（逐字稿、紀錄、選用錄音）
```

> 重點：**每場會議 = 一個 Durable Object 房間**，同時扮演「音訊中繼」與「跨裝置字幕廣播」，並對應一條可分享的連結。觀看者接收廣播、不需自己辨識，因此加人不加辨識成本。

## 開發路線圖

- **Phase 0** — PWA 骨架 + 麥克風 + Web Speech API，部署 Cloudflare Pages 取得公開網址
- **Phase 1** — Deepgram + Durable Object 房間（中繼 + 語者分離）
- **Phase 2** — DeepL 雙語字幕 + D1 儲存
- **Phase 3** — 房間廣播 + `/m/:id` 分享連結 + QR + 觀看者唯讀模式
- **Phase 4** — Gemini AI 會議紀錄（**MVP 完成**）+ 登入 / 歷史 / 離線快取

---

_目前內容為規劃階段產物；程式實作尚未開始。_
