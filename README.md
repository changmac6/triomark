# TrioMark

TrioMark 是一個用來蒐集與整合 **client 端 + server 端** 識別訊號的研究型專案。

目標不是單靠單一 fingerprint 直接認人，而是盡量收集可用線索，協助後端判斷：

- 是否為高風險 client
- 是否為異常瀏覽器環境
- 是否需要額外驗證
- 是否值得限制、標記或封鎖

## 特色

- 蒐集前端環境訊號
- 讀取後端請求與 TLS / HTTP 資訊
- 整合 stable / unstable components
- 產生 client / server / unified 識別結果
- 提供 demo 頁直接查看輸出結果

## 專案結構

```text
.
├─ public/
│  ├─ triomark.js
│  └─ triomark-demo.html
├─ src/
│  └─ client/
├─ scripts/
├─ docs/
├─ server.js
├─ package.json
└─ README.md
```

## 安裝

```bash
npm install
```

## 產生本機測試憑證

```bash
npm run gen-cert
```

## 啟動

```bash
npm start
```

預設會啟動在：

```text
https://127.0.0.1:8443
```

## 可用路由

- `/healthz`
- `/hello-raw`
- `/fingerprint`
- `/fingerprint/debug`
- `/triomark-demo.html`

## 說明

### `/fingerprint`

回傳整理後的 server 端指紋資料，例如：

- client IP
- headers
- client hints
- TLS 資訊
- JA3 / JA4
- SNI
- ALPN
- query / path / cookie 特徵

### `/triomark-demo.html`

展示前端蒐集結果，並合併 `/fingerprint` 的後端資料，方便直接檢查整體輸出。

## 注意事項

- 這個專案目前偏向研究與實驗用途
- 如果 TLS 在反向代理或 CDN 就被終止，Node.js 將看不到原始 ClientHello
- `certs/`、`node_modules/`、`.env` 不應提交到 Git

## 目前狀態

目前已包含：

- 基本 HTTPS server
- TLS ClientHello 讀取
- `/fingerprint` 指紋輸出
- TrioMark 前端 collector
- demo 頁面整合展示

後續可再擴充：

- 風險評分
- 封鎖規則
- 持久化儲存
- 驗證流程串接
