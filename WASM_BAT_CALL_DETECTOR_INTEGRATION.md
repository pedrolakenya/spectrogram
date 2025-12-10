# WASM Bat Call Detector Integration Guide

## Overview

The `BatCallDetector` class has been optimized to support **WebAssembly (WASM) FFT computation** for significantly faster bat call detection. The WASM engine is optional and transparent - when not provided, the detector automatically falls back to the pure JavaScript Goertzel algorithm.

## Performance Benefits

- **Legacy Goertzel Algorithm**: O(N*B) where N = audio samples, B = frequency bins
- **WASM FFT Engine**: O(N log N) with compiled Rust implementation
- **Speedup**: 10-100x faster for typical bat call analysis workflows

## Architecture

### Three-Tier Implementation

1. **`BatCallDetector.generateSpectrogramWasm()`** - WASM-accelerated spectrogram generation
2. **`BatCallDetector.generateSpectrogramLegacy()`** - Pure JavaScript Goertzel fallback
3. **`BatCallDetector.generateSpectrogram()`** - Intelligent wrapper that auto-selects based on availability

### Data Flow

```
Audio Input
    ↓
[WASM Engine] → compute_spectrogram() → Float32Array (linear magnitude)
    ↓
[JS Processing] → Reshape + dB conversion → { powerMatrix, timeFrames, freqBins }
    ↓
[BatCallDetector] → Rest of detection pipeline (unchanged)
```

## Usage Examples

### Basic Usage (Automatic WASM Selection)

```javascript
import { BatCallDetector } from './modules/batCallDetector.js';
import { getOrCreateWasmEngine } from './modules/wsManager.js';

// Get or create a WASM engine
const wasmEngine = getOrCreateWasmEngine(1024, 'hann');

// Create detector with WASM support
const detector = new BatCallDetector(config, wasmEngine);

// Use as normal - will automatically use WASM if available
const calls = await detector.detectCalls(audioData, sampleRate, flowKHz, fhighKHz);
```

### In Call Analysis Popup

The `showCallAnalysisPopup()` function now accepts an optional `wasmEngine` parameter:

```javascript
import { showCallAnalysisPopup } from './modules/callAnalysisPopup.js';
import { getOrCreateWasmEngine } from './modules/wsManager.js';

const wasmEngine = getOrCreateWasmEngine();

showCallAnalysisPopup({
  selection: selection,
  wavesurfer: wavesurferInstance,
  currentSettings: settings,
  wasmEngine  // Optional: enable WASM acceleration
});
```

### Batch Processing with WASM

```javascript
import { initBatCallDetector } from './modules/batCallAnalysis.js';
import { getOrCreateWasmEngine } from './modules/wsManager.js';

const wasmEngine = getOrCreateWasmEngine(1024, 'hann');
const detector = initBatCallDetector(config, wasmEngine);

// Process multiple selections with WASM acceleration
const results = await BatchProcessor.processSelections(
  detector,
  selections,
  audioData,
  sampleRate
);
```

### Fallback Behavior

If WASM is not available, the detector automatically falls back:

```javascript
const detector = new BatCallDetector(config, null);
// Will use legacy Goertzel algorithm silently
```

## WASM Engine Initialization

The WASM module is initialized in `main.js`:

```javascript
import init, * as spectrogramWasm from './modules/spectrogram_wasm.js';

init().then(() => {
    globalThis._spectrogramWasm = spectrogramWasm;
}).catch(e => {
    console.error('WASM initialization failed:', e);
});
```

Helper function in `wsManager.js`:

```javascript
export function getOrCreateWasmEngine(fftSize = 1024, windowFunc = 'hann') {
  if (!globalThis._spectrogramWasm?.SpectrogramEngine) {
    console.warn('WASM module not available');
    return null;
  }
  return new globalThis._spectrogramWasm.SpectrogramEngine(fftSize, windowFunc, null);
}
```

## Implementation Details

### WASM Spectrogram Computation

The `generateSpectrogramWasm()` method:

1. **Calls WASM FFT**: `wasmEngine.compute_spectrogram(audioData, hopSize)`
   - Returns: `Float32Array` with linear magnitude values (flat)
   - Shape: `[numFrames * numBinsTotal]`

2. **Retrieves Metadata**: 
   - `numBinsTotal = wasmEngine.get_freq_bins()`
   - `numFrames = rawSpectrum.length / numBinsTotal`

3. **Extracts Frequency Range**:
   - Crops to user-specified `[flowKHz, fhighKHz]`
   - Maps bin indices to frequencies

4. **Converts to dB**:
   - Formula: `10 * log10((magnitude^2 / fftSize) / 1e-16)` (avoids -Infinity)
   - Returns 2D matrix: `powerMatrix[frameIdx][binIdx]`

### Backward Compatibility

- **No changes to the detection pipeline** - output format is identical
- **Existing code works unchanged** - the wrapper method handles selection
- **Graceful degradation** - missing WASM silently uses JavaScript

## WASM Engine Specifications

### Constructor Parameters

```javascript
new SpectrogramEngine(
  fftSize,      // 1024, 2048, 4096, etc. (must be power of 2)
  windowFunc,   // 'hann', 'blackman', 'hamming', etc.
  alpha         // Window parameter (optional, null for defaults)
)
```

### Available Methods

- `compute_spectrogram(audioData, noverlap)` → Float32Array (linear magnitude)
- `get_fft_size()` → number
- `get_freq_bins()` → number (fftSize / 2 + 1)
- `set_spectrum_config(scale, freq_min, freq_max)` → void
- `compute_spectrogram_u8(...)` → Uint8Array (quantized to 0-255)

## Performance Testing

To measure the speedup:

```javascript
// Legacy method
console.time('Goertzel');
const legacy = detector.generateSpectrogramLegacy(audioData, sr, fmin, fmax);
console.timeEnd('Goertzel');

// WASM method
console.time('WASM FFT');
const wasm = detector.generateSpectrogramWasm(audioData, sr, fmin, fmax);
console.timeEnd('WASM FFT');
```

Expected results:
- **Short audio (< 1s)**: WASM may not be faster due to startup overhead
- **Medium audio (1-10s)**: 3-10x speedup
- **Long audio (> 10s)**: 10-100x speedup

## Migration Checklist

- [x] Renamed `generateSpectrogram` → `generateSpectrogramLegacy`
- [x] Created `generateSpectrogramWasm` with FFT acceleration
- [x] Added wrapper `generateSpectrogram` for auto-selection
- [x] Modified `BatCallDetector` constructor to accept `wasmEngine`
- [x] Added `getOrCreateWasmEngine()` helper in `wsManager.js`
- [x] Updated `showCallAnalysisPopup()` to accept `wasmEngine`
- [x] Updated `frequencyHover.js` to pass WASM engine
- [x] Added `initBatCallDetector()` export in `batCallAnalysis.js`
- [x] All backward compatibility maintained

## Troubleshooting

### WASM not found error

**Symptom**: "WASM module not available for bat call detection"

**Solution**: Ensure `init()` has completed before calling `getOrCreateWasmEngine()`:

```javascript
init().then(() => {
  // Now WASM is available
  const engine = getOrCreateWasmEngine();
}).catch(e => console.error(e));
```

### Incorrect spectrogram shape

**Symptom**: Output dimensions don't match expected

**Verify**:
- `numBinsTotal === fftSize / 2 + 1`
- `numFrames = rawSpectrum.length / numBinsTotal`
- Frequency range cropping logic

### Performance not improved

**Check**:
- Is `wasmEngine` actually being passed? (add console.log)
- Is WASM module loaded? (check Network tab in DevTools)
- Is audio file large enough? (< 1s may not show benefit)

## Future Optimizations

1. **Caching**: Reuse same `SpectrogramEngine` instance for multiple calls
2. **Worker Threads**: Offload WASM computation to Web Worker
3. **Streaming**: Process audio in chunks for real-time detection
4. **SIMD**: Enable further vectorization in Rust WASM

## References

- `src/lib.rs` - Rust FFT implementation
- `modules/spectrogram_wasm.js` - JavaScript bindings
- `modules/batCallDetector.js` - Detection logic
- `modules/wsManager.js` - WASM integration helpers
