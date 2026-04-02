# TrioMark

這是依據老爺上傳的三份參考實作整理出的新 collector：

- FingerprintJS：來源排序、非同步 source、穩定化思路
- OpenClientID：component registry、stable/unstable、composite 組裝
- ThumbmarkJS：component 分類、include/exclude/stabilize 的方向

## 檔案

- `triomark.js`：前端 collector 主模組
- `triomark-demo.html`：示範頁，會呼叫現有 `/fingerprint` 並把前後端資料合併顯示

## 主要特點

- 含三家聯集前端 component（以 OpenClientID 聯集為主，覆蓋 FingerprintJS 與 ThumbmarkJS 常見欄位）
- 保留 stable / unstable 分桶
- 產生 client composite / stableComposite
- 額外計算：
  - `serverStableHash`
  - `serverSessionHash`
  - `stableCompositeHash`
  - `sessionCompositeHash`
- 可直接接老爺現有 `triomark` 的 `/fingerprint`

## 目前未做

- 沒有改老爺後端 API；只是直接 GET `/fingerprint`
- 沒有做資料庫寫入
- 沒有做封鎖規則引擎

## 建議下一步

1. 把 `triomark.js` 放進你的前端專案
2. 在頁面載入後呼叫 `collectTriomark()`
3. 把結果 POST 回後端儲存
4. 後端再把 `client stable/session hash + server stable/session hash` 做風險與封鎖比對
