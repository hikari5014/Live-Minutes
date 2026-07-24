# 部署指南（GitHub → Cloudflare）

Live Minutes 是一個「單一 Cloudflare Worker」全端應用：Worker 同時託管前端
（Workers Static Assets）、API、以及每場會議一個的 **Durable Object 房間**，
逐字稿與紀錄存於 **D1**。

> 需要你出面的只有這一步：把專案連上你的 **Cloudflare 帳號**、建立 D1、設定金鑰、部署。
> 以下指令都在專案根目錄執行。

---

## 0. 前置

```bash
npm install
```

需要的免費帳號 / 金鑰（皆有免費額度）：

| 服務 | 用途 | 申請 |
| --- | --- | --- |
| Cloudflare | 託管前端 + Worker + Durable Objects + D1 | https://dash.cloudflare.com |
| DeepL API Free | 翻譯（英↔中↔日…） | https://www.deepl.com/pro-api |
| Google Gemini | 生成會議紀錄 | https://aistudio.google.com/apikey |
| Deepgram（選用） | 高品質辨識 + 語者分離 | https://console.deepgram.com |

> 不設定任何金鑰也能跑：前端用瀏覽器內建 **Web Speech API** 即時字幕、AI 紀錄與跨裝置翻譯則需上述金鑰。

---

## 1. 本地開發（不需連 Cloudflare 帳號）

兩種模式：

**A. 純前端（最快，零設定）**
```bash
npm run dev          # http://localhost:5173
```
可測試：可安裝 PWA、即時字幕（Web Speech）、設定與 UI。翻譯 / 房間 / AI 紀錄需後端。

**B. 全端本地（含 Worker + Durable Object + D1，仍在本機）**
```bash
cp .dev.vars.example .dev.vars     # 填入 DEEPL_API_KEY / GEMINI_API_KEY（Deepgram 選填）
npm run build                      # 產生 dist/ 給 Worker 當靜態資源
npm run worker:dev                 # wrangler dev，本機模擬 DO + D1，http://localhost:8787
```
`wrangler dev` 會在本機用 Miniflare 模擬 Durable Objects 與 D1，**不需登入 Cloudflare**。

---

## 2. 連上 Cloudflare 並部署

```bash
# 2.1 登入（開瀏覽器授權）
npx wrangler login

# 2.2 建立 D1 資料庫，把回傳的 database_id 貼進 wrangler.toml 的 [[d1_databases]]
npx wrangler d1 create live_minutes

# 2.3 建立資料表
npm run db:init            # = wrangler d1 execute live_minutes --file=./schema.sql

# 2.4 設定正式環境金鑰（secrets）
npx wrangler secret put DEEPL_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put DEEPGRAM_API_KEY   # 選用

# 2.5 建置前端並部署 Worker（含前端、DO、D1）
npm run deploy             # = npm run build && wrangler deploy
```

部署完成後會得到一個網址（`https://live-minutes.<你的子網域>.workers.dev`）。
打開它、按「開始錄音」，把分享連結傳給朋友即可跨裝置同看。要綁自己的網域，
到 Cloudflare 儀表板 Workers → Custom Domains 設定。

> **DeepL 端點**：免費版金鑰用預設 `https://api-free.deepl.com`（wrangler.toml 已設）。
> 付費版請改 `DEEPL_API_HOST=https://api.deepl.com`。

---

## 3. 免費額度備忘

- **Cloudflare**：Workers 10 萬請求/日、Durable Objects（免費方案含，WebSocket
  Hibernation 讓沉默時段不計費）、D1 免費約 5GB。
- **DeepL Free**：50 萬字元/月。只翻定稿句 + 同語言去重可大幅節省。
- **Gemini**：每場會議一次呼叫；可在開始畫面關閉「會後 AI 紀錄」以省額度。
- **Deepgram**：一次性 US$200 額度（非每月）；未設定時自動退回免費 Web Speech。

---

## 4. 架構速覽

```
GitHub ──push──▶ (你的 CI 或本機) ──wrangler deploy──▶ Cloudflare Worker
                                                        ├─ ASSETS：前端 PWA（dist/）
                                                        ├─ /api/*：translate / minutes / token / session
                                                        └─ ROOMS：MeetingRoom Durable Object（每場會議一個房間）
外部：Deepgram（選用 ASR）· DeepL（翻譯）· Gemini（紀錄）　儲存：D1
```

- 主持人裝置：Web Speech 產生字幕 → 透過 WS 發佈到房間。
- 房間（DO）：依每位觀看者語言翻譯後廣播；結束時把逐字稿寫入 D1。
- 觀看者：點 `/m/:id` 連結加入、可自選字幕語言；散會後 `/minutes/:id` 看紀錄。
