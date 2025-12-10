/**
 * Bat Call Analysis Utilities
 * 
 * Professional-grade analysis tools aligned with:
 * - Avisoft-SASLab Pro
 * - SonoBat
 * - Kaleidoscope Pro
 * - BatSound
 * 
 * This module provides comprehensive utilities for analyzing, exporting,
 * and comparing bat call parameters with scientific precision.
 */

import { BatCall, BatCallDetector } from './batCallDetector.js';

/**
 * Initialize a BatCallDetector with optional WASM engine for performance
 * @param {Object} config - Configuration object
 * @param {Object} wasmEngine - Optional SpectrogramEngine instance for WASM acceleration
 * @returns {BatCallDetector}
 */
export function initBatCallDetector(config = {}, wasmEngine = null) {
  return new BatCallDetector(config, wasmEngine);
}

/**
 * Batch analysis results container
 */
export class AnalysisResults {
  constructor(selection, calls = []) {
    this.selection = selection;  // { startTime, endTime, Flow, Fhigh }
    this.calls = calls;           // Array of BatCall objects
    this.analysisTime = new Date();
    this.metadata = {};
  }
  
  /**
   * Export to Avisoft-compatible CSV format
   */
  exportToCSV() {
    const headers = [
      'Selection #',
      'Selection Start (s)',
      'Selection End (s)',
      'Duration (s)',
      'Start Frequency (kHz)',
      'End Frequency (kHz)',
      'Low Frequency (kHz)',
      'High Frequency (kHz)',
      'Peak Frequency (kHz)',
      'Bandwidth (kHz)',
      'Characteristic Frequency (kHz)',
      'Call Type',
      'Peak Power (dB)',
    ];
    
    let csv = headers.join(',') + '\n';
    
    this.calls.forEach((call, idx) => {
      const row = [
        idx + 1,
        call.startTime_s?.toFixed(4) || '-',
        call.endTime_s?.toFixed(4) || '-',
        call.duration_ms?.toFixed(3) || '-',
        call.startFreq_kHz?.toFixed(2) || '-',
        call.endFreq_kHz?.toFixed(2) || '-',
        call.endFreq_kHz?.toFixed(2) || '-',
        call.startFreq_kHz?.toFixed(2) || '-',
        call.peakFreq_kHz?.toFixed(2) || '-',
        call.bandwidth_kHz?.toFixed(2) || '-',
        call.characteristicFreq_kHz?.toFixed(2) || '-',
        call.callType || '-',
        call.peakPower_dB?.toFixed(1) || '-',
      ];
      csv += row.join(',') + '\n';
    });
    
    return csv;
  }
  
  /**
   * Export to JSON format (preserves full precision and metadata)
   */
  exportToJSON() {
    return {
      metadata: {
        analysisTime: this.analysisTime.toISOString(),
        version: '1.0',
        standard: 'Professional Bat Detector Standard',
      },
      selection: this.selection,
      callCount: this.calls.length,
      calls: this.calls.map(call => call.toAnalysisRecord()),
      statistics: this.calculateStatistics(),
    };
  }
  
  /**
   * Calculate statistics across all detected calls
   */
  calculateStatistics() {
    if (this.calls.length === 0) {
      return null;
    }
    
    const freqs = this.calls.map(c => c.peakFreq_kHz).filter(f => f !== null);
    const durations = this.calls.map(c => c.duration_ms).filter(d => d !== null);
    const bandwidths = this.calls.map(c => c.bandwidth_kHz).filter(b => b !== null);
    
    const stats = {
      callCount: this.calls.length,
      
      // Frequency statistics
      peakFreq: {
        min: Math.min(...freqs),
        max: Math.max(...freqs),
        mean: freqs.length > 0 ? freqs.reduce((a, b) => a + b) / freqs.length : null,
      },
      
      // Duration statistics (ms)
      duration: {
        min: Math.min(...durations),
        max: Math.max(...durations),
        mean: durations.length > 0 ? durations.reduce((a, b) => a + b) / durations.length : null,
        total: durations.reduce((a, b) => a + b, 0),
      },
      
      // Bandwidth statistics
      bandwidth: {
        min: Math.min(...bandwidths),
        max: Math.max(...bandwidths),
        mean: bandwidths.length > 0 ? bandwidths.reduce((a, b) => a + b) / bandwidths.length : null,
      },
      
      // Call type distribution
      callTypes: this.getCallTypeDistribution(),
    };
    
    return stats;
  }
  
  /**
   * Get distribution of call types
   */
  getCallTypeDistribution() {
    const dist = { CF: 0, FM: 0, 'CF-FM': 0 };
    this.calls.forEach(call => {
      if (dist.hasOwnProperty(call.callType)) {
        dist[call.callType]++;
      }
    });
    return dist;
  }
  
  /**
   * Validate all calls according to professional standards
   * Returns: array of { callIndex, valid, reason }
   */
  validateAll() {
    return this.calls.map((call, idx) => {
      const validation = call.validate();
      return {
        callIndex: idx,
        ...validation,
      };
    });
  }
  
  /**
   * Get summary report (human-readable)
   */
  getSummaryReport() {
    const stats = this.calculateStatistics();
    if (!stats) return 'No calls detected.';
    
    const report = [];
    report.push('=== Bat Call Analysis Summary ===');
    report.push(`Total calls detected: ${stats.callCount}`);
    report.push('');
    
    report.push('Frequency Analysis:');
    report.push(`  Peak Freq range: ${stats.peakFreq.min.toFixed(1)} - ${stats.peakFreq.max.toFixed(1)} kHz`);
    report.push(`  Mean Peak Freq: ${stats.peakFreq.mean?.toFixed(2)} kHz`);
    report.push('');
    
    report.push('Duration Analysis:');
    report.push(`  Duration range: ${stats.duration.min.toFixed(2)} - ${stats.duration.max.toFixed(2)} ms`);
    report.push(`  Mean duration: ${stats.duration.mean?.toFixed(2)} ms`);
    report.push(`  Total duration: ${stats.duration.total.toFixed(2)} ms`);
    report.push('');
    
    report.push('Bandwidth Analysis:');
    report.push(`  Bandwidth range: ${stats.bandwidth.min.toFixed(2)} - ${stats.bandwidth.max.toFixed(2)} kHz`);
    report.push(`  Mean bandwidth: ${stats.bandwidth.mean?.toFixed(2)} kHz`);
    report.push('');
    
    report.push('Call Type Distribution:');
    report.push(`  CF (Constant Frequency): ${stats.callTypes.CF}`);
    report.push(`  FM (Frequency Modulated): ${stats.callTypes.FM}`);
    report.push(`  CF-FM (Mixed): ${stats.callTypes['CF-FM']}`);
    
    return report.join('\n');
  }
}

/**
 * Species identification helper based on call parameters
 * Reference: Kunz & Fenton, "Bat Ecology" and regional field guides
 */
export class SpeciesIdentifier {
  /**
   * Rough species identification based on frequency and call characteristics
   * Returns: { likelySpecies: string[], confidence: 'high'|'medium'|'low' }
   * 
   * This is for demonstration/reference only - actual species ID requires
   * expert knowledge and comparison with regional reference libraries.
   */
  static suggestSpecies(call) {
    if (!call.peakFreq_kHz || !call.bandwidth_kHz) {
      return { likelySpecies: [], confidence: 'low' };
    }
    
    const freq = call.peakFreq_kHz;
    const bw = call.bandwidth_kHz;
    const charFreq = call.characteristicFreq_kHz || call.peakFreq_kHz;
    const callType = call.callType;
    
    const candidates = [];
    
    // CF Bats (narrow bandwidth)
    if (callType === 'CF' && bw < 5) {
      if (freq >= 78 && freq <= 84) {
        candidates.push('Rhinolophus ferrumequinum (Greater Horseshoe Bat)');
      }
      if (freq >= 38 && freq <= 45) {
        candidates.push('Rhinolophus hipposideros (Lesser Horseshoe Bat)');
      }
      if (freq >= 22 && freq <= 28) {
        candidates.push('Tadarida brasiliensis (Brazilian Free-tailed Bat)');
      }
    }
    
    // FM Bats (high bandwidth, downward FM)
    if ((callType === 'FM' || callType === 'CF-FM') && bw > 10) {
      if (freq >= 100 && freq <= 150 && call.startFreq_kHz > call.endFreq_kHz) {
        candidates.push('Myotis sp. (Little Brown Bat group)');
      }
      if (freq >= 30 && freq <= 80) {
        candidates.push('Eptesicus sp. or Nyctalus sp.');
      }
    }
    
    // Molossidae (free-tailed bats)
    if (freq >= 10 && freq <= 30 && bw < 10) {
      candidates.push('Molossidae (Free-tailed Bat)');
    }
    
    if (candidates.length === 0) {
      candidates.push('Unknown - check regional field guides');
    }
    
    return {
      likelySpecies: candidates,
      confidence: candidates.length > 0 ? 'low' : 'very low',
      note: 'Use only as reference. Consult with acoustical ecologists for accurate species identification.',
    };
  }
}

/**
 * Quality assurance checker
 */
export class QualityAssurance {
  /**
   * Check if analysis meets professional publication standards
   * Returns: { meetsStandards: boolean, issues: string[] }
   */
  static checkAnalysisQuality(analysisResults) {
    const issues = [];
    
    // Check minimum call count
    if (analysisResults.calls.length === 0) {
      issues.push('No calls detected');
    }
    
    // Check for missing parameters
    analysisResults.calls.forEach((call, idx) => {
      if (!call.peakFreq_kHz) issues.push(`Call ${idx}: Missing peak frequency`);
      if (!call.startFreq_kHz) issues.push(`Call ${idx}: Missing start frequency`);
      if (!call.endFreq_kHz) issues.push(`Call ${idx}: Missing end frequency`);
      if (!call.duration_ms) issues.push(`Call ${idx}: Missing duration`);
    });
    
    // Check for parameter consistency
    analysisResults.calls.forEach((call, idx) => {
      if (call.endFreq_kHz > call.peakFreq_kHz) {
        issues.push(`Call ${idx}: End frequency exceeds peak frequency`);
      }
      if (call.peakFreq_kHz > call.startFreq_kHz) {
        issues.push(`Call ${idx}: Peak frequency exceeds start frequency`);
      }
      if (call.duration_ms <= 0.5) {
        issues.push(`Call ${idx}: Duration < 0.5ms (possible artifact)`);
      }
    });
    
    return {
      meetsStandards: issues.length === 0,
      issues,
      summary: issues.length === 0 ? 
        'Analysis passes quality checks' : 
        `${issues.length} quality issues detected`,
    };
  }
}

/**
 * Precision validator - check accuracy against known standards
 * (Used for validation/testing against professional software)
 */
export class PrecisionValidator {
  /**
   * Compare detected parameters with reference values
   * Returns: { errorHz, errorMs, withinTolerance }
   */
  static compareWithReference(detectedCall, referenceCall, toleranceHz = 1, toleranceMs = 0.5) {
    const errorHz = Math.abs((detectedCall.peakFreq_kHz || 0) - (referenceCall.peakFreq_kHz || 0)) * 1000;
    const errorMs = Math.abs((detectedCall.duration_ms || 0) - (referenceCall.duration_ms || 0));
    
    return {
      errorHz: errorHz.toFixed(2),
      errorMs: errorMs.toFixed(3),
      withinTolerance: errorHz <= toleranceHz && errorMs <= toleranceMs,
      freqOK: errorHz <= toleranceHz,
      timeOK: errorMs <= toleranceMs,
    };
  }
}

/**
 * Batch processing coordinator
 */
export class BatchProcessor {
  /**
   * Process multiple audio selections (for full file analysis)
   */
  static async processSelections(detector, selections, audioData, sampleRate) {
    const allResults = [];
    
    for (const selection of selections) {
      const startSample = Math.floor(selection.startTime * sampleRate);
      const endSample = Math.floor(selection.endTime * sampleRate);
      
      const selectionAudio = audioData.slice(startSample, endSample);
      
      const calls = await detector.detectCalls(
        selectionAudio,
        sampleRate,
        selection.Flow,
        selection.Fhigh
      );
      
      allResults.push({
        selection,
        calls,
        analysisTime: new Date(),
      });
    }
    
    return allResults;
  }
}

export { AnalysisResults, SpeciesIdentifier, QualityAssurance, PrecisionValidator, BatchProcessor };
