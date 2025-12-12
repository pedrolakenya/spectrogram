# 高頻閾值選擇修復 - Threshold Selection Fix

## 問題描述

當 `findOptimalHighFrequencyThreshold` 在 -51dB 時檢測到信號低於噪聲層而執行 break 時，系統應該選擇 break 之前的最後有效閾值（-50.5dB），但實際上卻選擇了 -60.5dB（由異常檢測邏輯確定）。

### 症狀
```
[JUMP CHECK] Threshold: -51dB | Freq: 67.83 → 75.29 kHz (Jump: 7.46 kHz > 4.0)
  Current Power: -120.02 dB | Noise Floor: -105.65 dB | Delta: -14.37 dB
  ✗ Signal AT/BELOW noise floor → BREAK (hit noise)

最後返回的 threshold: -60.5dB (不在 console 中顯示)
```

## 根本原因

主迴圈正確執行了 break，但異常檢測邏輯（post-loop anomaly detection）優先級更高，導致它選擇的異常點（-60.5dB）覆蓋了 break 決策。

### 代碼流程
1. **主迴圈**：從 -24dB 逐步測試到 -70dB
2. **Break 條件**：Jump > 4.0kHz 且信號 <= 噪聲層
   - -50.5dB：成功，添加到 measurements
   - -51dB：Jump 檢測 + 噪聲層檢查 → **BREAK**（-51dB 的測量未被添加）
3. **Anomaly Detection**：遍歷 validMeasurements（-24dB 到 -50.5dB）
   - 可能在某處找到 2.5kHz-4.0kHz 的頻率變化
   - 設置 `recordedEarlyAnomaly = -60.5dB`
4. **最終選擇**：使用 `recordedEarlyAnomaly`，忽略了 break

## 修復方案

### 變更 1：追蹤 Break 點
```javascript
const measurements = [];
let breakThreshold = null; // Track where we broke due to noise floor
```

### 變更 2：在 Break 時記錄
```javascript
} else {
  // Signal is at or below noise floor - stop immediately (hit noise)
  console.log(`✗ Signal AT/BELOW noise floor → BREAK (hit noise)`);
  breakThreshold = measurements.length > 0 
    ? measurements[measurements.length - 1].threshold 
    : -24;
  console.log(`[BREAK TRACKING] Set breakThreshold = ${breakThreshold}dB`);
  break;
}
```

### 變更 3：優先級覆蓋
在異常檢測選擇之後添加：
```javascript
// If we broke due to noise floor, override anomaly detection result
if (breakThreshold !== null && optimalThreshold !== breakThreshold) {
  console.log(`[BREAK OVERRIDE] Break occurred at ${breakThreshold}dB, overriding anomaly detection choice of ${optimalThreshold}dB`);
  optimalThreshold = breakThreshold;
  // 重新查找對應的測量值
  for (let i = validMeasurements.length - 1; i >= 0; i--) {
    if (validMeasurements[i].threshold === breakThreshold) {
      optimalMeasurement = validMeasurements[i];
      break;
    }
  }
}
```

## 預期結果

### 修復前
```
[ANOMALY RESULT] Early anomaly detected at threshold -60.5dB
[RETURN VALUE] threshold: -60.5dB, highFreq_kHz: XX.XX
```

### 修復後
```
[BREAK ANALYSIS] Loop stopped at threshold, Total measurements: XX, Valid: XX
  Last valid: -50.5dB (Freq: 67.83 kHz)
[ANOMALY RESULT] Early anomaly detected at threshold -60.5dB
[BREAK OVERRIDE] Break occurred at -50.5dB, overriding anomaly detection choice of -60.5dB
[FINAL THRESHOLD SELECTION]
  optimalThreshold: -50.5dB
  optimalMeasurement.threshold: -50.5dB
  optimalMeasurement.highFreq_kHz: 67.83
[RETURN VALUE] threshold: -50.5dB, highFreq_kHz: 67.83
```

## 修改文件
- `modules/batCallDetector.js` (方法 `findOptimalHighFrequencyThreshold`)

## 驗證步驟
1. 上傳包含相同 bat call 的音頻文件
2. 檢查 console 日誌
3. 確認 `-50.5dB` 出現在 `[BREAK OVERRIDE]` 和 `[RETURN VALUE]` 日誌中
4. 確認不再出現 `-60.5dB` 作為最終選擇

## 注意事項
- Break 追蹤只在主迴圈中發生時設置
- 如果沒有發生 break（正常完成迴圈），`breakThreshold` 保持為 `null`
- 異常檢測邏輯保持不變，但現在受到 break override 機制的約束
