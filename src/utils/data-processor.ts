/**
 * Data Processing Utilities for Bitcoin Stamps
 *
 * Bitcoin Stamps can store ANY data format on-chain.
 * This utility provides optional format detection for metadata purposes only.
 */

import { Buffer } from 'node:buffer';

export interface DataInfo {
  format: string;
  size: number;
  width?: number;
  height?: number;
}

/**
 * Bitcoin Stamps transaction size constraint
 */
export const STAMP_MAX_SIZE = 100000; // 100KB - Bitcoin transaction size limit

/**
 * Data Processing Utilities
 */
export class DataProcessor {
  /**
   * Detect common data format from binary data (optional - for metadata only)
   * Returns 'UNKNOWN' for unrecognized formats (which is perfectly valid for Stamps)
   */
  static detectFormat(data: Buffer): string {
    if (data.length < 8) return 'UNKNOWN';

    // PNG signature
    if (
      data.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    ) {
      return 'PNG';
    }

    // GIF signatures
    if (
      data.subarray(0, 6).equals(Buffer.from('GIF87a', 'ascii')) ||
      data.subarray(0, 6).equals(Buffer.from('GIF89a', 'ascii'))
    ) {
      return 'GIF';
    }

    // JPEG signature
    if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
      return 'JPEG';
    }

    // WebP signature
    if (
      data.subarray(0, 4).equals(Buffer.from('RIFF', 'ascii')) &&
      data.length > 12 &&
      data.subarray(8, 12).equals(Buffer.from('WEBP', 'ascii'))
    ) {
      return 'WEBP';
    }

    // JSON detection
    const str = data.toString('utf8', 0, Math.min(100, data.length));
    if (str.trimStart().startsWith('{') || str.trimStart().startsWith('[')) {
      try {
        JSON.parse(data.toString('utf8'));
        return 'JSON';
      } catch {
        // Not valid JSON
      }
    }

    // Text detection (simple heuristic)
    if (this.isProbablyText(data)) {
      return 'TEXT';
    }

    return 'UNKNOWN'; // Unknown format is perfectly valid for Stamps
  }

  /**
   * Simple heuristic to detect if data is likely text
   */
  private static isProbablyText(data: Buffer): boolean {
    const sample = data.subarray(0, Math.min(1000, data.length));
    let printableCount = 0;

    for (const byte of sample) {
      // Check if byte is printable ASCII or common whitespace
      if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
        printableCount++;
      }
    }

    // If >90% of bytes are printable, likely text
    return printableCount / sample.length > 0.9;
  }

  /**
   * Create a data URL from binary data
   * Useful for preview/display purposes
   */
  static createDataURL(data: Buffer, mimeType?: string): string {
    const base64 = data.toString('base64');

    if (mimeType) {
      return `data:${mimeType};base64,${base64}`;
    }

    // Auto-detect mime type from format
    const format = this.detectFormat(data);
    const mimeMap: Record<string, string> = {
      'PNG': 'image/png',
      'GIF': 'image/gif',
      'JPEG': 'image/jpeg',
      'WEBP': 'image/webp',
      'JSON': 'application/json',
      'TEXT': 'text/plain',
    };

    const detectedMime = mimeMap[format] || 'application/octet-stream';
    return `data:${detectedMime};base64,${base64}`;
  }

  /**
   * Get data info for metadata purposes
   */
  static getDataInfo(data: Buffer): DataInfo {
    return {
      format: this.detectFormat(data),
      size: data.length,
    };
  }

  /**
   * Check if data exceeds transaction size limit
   * This is the ONLY real constraint for Bitcoin Stamps
   */
  static exceedsMaxSize(data: Buffer): boolean {
    return data.length > STAMP_MAX_SIZE;
  }
}
