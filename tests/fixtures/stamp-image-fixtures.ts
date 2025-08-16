/**
 * Stamp Image Fixtures
 *
 * Real image file data for Bitcoin stamp testing.
 * Provides standardized image fixtures for consistent testing across all stamp tests.
 */

import { Buffer } from 'node:buffer';
export interface StampImageFixture {
  name: string;
  format: 'png' | 'gif' | 'jpeg' | 'webp';
  dimensions: { width: number; height: number };
  bytes: Buffer;
  size: number;
  mimeType: string;
  characteristics: string[];
  description: string;
}

/**
 * Minimal 1x1 transparent PNG (67 bytes)
 * Standard minimal test case for basic functionality
 */
const MINIMAL_PNG_1X1 = Buffer.from([
  // PNG signature
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  // IHDR chunk (13 bytes data)
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52,
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
  0x1f,
  0x15,
  0xc4,
  0x89,
  // IDAT chunk (transparent pixel)
  0x00,
  0x00,
  0x00,
  0x0a,
  0x49,
  0x44,
  0x41,
  0x54,
  0x78,
  0x9c,
  0x63,
  0x00,
  0x01,
  0x00,
  0x00,
  0x05,
  0x00,
  0x01,
  0x0d,
  0x0a,
  0x2d,
  0xb4,
  // IEND chunk
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4e,
  0x44,
  0xae,
  0x42,
  0x60,
  0x82,
]);

/**
 * Small 4x4 RGB PNG (85 bytes)
 * For testing slightly larger but still minimal images
 */
const SMALL_PNG_4X4 = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52,
  0x00,
  0x00,
  0x00,
  0x04,
  0x00,
  0x00,
  0x00,
  0x04,
  0x08,
  0x02,
  0x00,
  0x00,
  0x00,
  0x26,
  0x93,
  0x09,
  0x29,
  0x00,
  0x00,
  0x00,
  0x1c,
  0x49,
  0x44,
  0x41,
  0x54,
  0x78,
  0x9c,
  0x63,
  0xf8,
  0x0f,
  0x00,
  0x00,
  0xff,
  0xff,
  0x3f,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x40,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x20,
  0x5e,
  0x0f,
  0x92,
  0x1d,
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4e,
  0x44,
  0xae,
  0x42,
  0x60,
  0x82,
]);

/**
 * Minimal 1-frame GIF (35 bytes)
 * Standard minimal test case for GIF format
 */
const MINIMAL_GIF_1X1 = Buffer.from([
  // GIF signature
  0x47,
  0x49,
  0x46,
  0x38,
  0x39,
  0x61,
  // Screen width/height (1x1)
  0x01,
  0x00,
  0x01,
  0x00,
  // Global color table flag + resolution + sort + color table size
  0x80,
  0x00,
  0x00,
  // Global color table (black, white)
  0x00,
  0x00,
  0x00,
  0xff,
  0xff,
  0xff,
  // Image separator
  0x2c,
  // Image left/top/width/height
  0x00,
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x01,
  0x00,
  // Local color table flag
  0x00,
  // LZW minimum code size
  0x02,
  // Data sub-block (3 bytes: clear code, end code, block terminator)
  0x02,
  0x44,
  0x01,
  0x00,
  // Trailer
  0x3b,
]);

/**
 * Test JPEG header (minimal JPEG structure - ~100 bytes)
 */
const MINIMAL_JPEG_1X1 = Buffer.from([
  // JPEG signature
  0xff,
  0xd8,
  0xff,
  0xe0,
  // JFIF segment length
  0x00,
  0x10,
  // JFIF identifier
  0x4a,
  0x46,
  0x49,
  0x46,
  0x00,
  // JFIF version (1.01)
  0x01,
  0x01,
  // Density units (pixels per inch)
  0x01,
  // X density
  0x00,
  0x48,
  // Y density
  0x00,
  0x48,
  // Thumbnail width/height
  0x00,
  0x00,
  // SOF0 segment
  0xff,
  0xc0,
  0x00,
  0x11,
  0x08,
  // Image height/width (1x1)
  0x00,
  0x01,
  0x00,
  0x01,
  // Components
  0x01,
  0x01,
  0x11,
  0x00,
  // DHT segment (simplified)
  0xff,
  0xc4,
  0x00,
  0x14,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x08,
  // SOS segment
  0xff,
  0xda,
  0x00,
  0x08,
  0x01,
  0x01,
  0x00,
  0x00,
  0x3f,
  0x00,
  // Minimal image data
  0x55,
  // EOI
  0xff,
  0xd9,
]);

/**
 * Standard stamp image fixtures organized by format and characteristics
 */
export class StampImageFixtures {
  /**
   * PNG format fixtures
   */
  static readonly PNG = {
    minimal_1x1: {
      name: 'minimal_1x1_png',
      format: 'png' as const,
      dimensions: { width: 1, height: 1 },
      bytes: MINIMAL_PNG_1X1,
      size: MINIMAL_PNG_1X1.length,
      mimeType: 'image/png',
      characteristics: ['minimal', 'transparent', 'single_pixel'],
      description: 'Minimal 1x1 transparent PNG for basic functionality testing',
    },

    small_4x4: {
      name: 'small_4x4_png',
      format: 'png' as const,
      dimensions: { width: 4, height: 4 },
      bytes: SMALL_PNG_4X4,
      size: SMALL_PNG_4X4.length,
      mimeType: 'image/png',
      characteristics: ['small', 'rgb', 'multi_pixel'],
      description: 'Small 4x4 RGB PNG for size testing',
    },
  };

  /**
   * GIF format fixtures
   */
  static readonly GIF = {
    minimal_1x1: {
      name: 'minimal_1x1_gif',
      format: 'gif' as const,
      dimensions: { width: 1, height: 1 },
      bytes: MINIMAL_GIF_1X1,
      size: MINIMAL_GIF_1X1.length,
      mimeType: 'image/gif',
      characteristics: ['minimal', 'single_frame', 'palette'],
      description: 'Minimal 1x1 GIF for format compatibility testing',
    },
  };

  /**
   * JPEG format fixtures
   */
  static readonly JPEG = {
    minimal_1x1: {
      name: 'minimal_1x1_jpeg',
      format: 'jpeg' as const,
      dimensions: { width: 1, height: 1 },
      bytes: MINIMAL_JPEG_1X1,
      size: MINIMAL_JPEG_1X1.length,
      mimeType: 'image/jpeg',
      characteristics: ['minimal', 'lossy', 'grayscale'],
      description: 'Minimal 1x1 JPEG for format testing',
    },
  };

  /**
   * Get all fixtures as a flat array
   */
  static getAllFixtures(): StampImageFixture[] {
    return [
      ...Object.values(this.PNG),
      ...Object.values(this.GIF),
      ...Object.values(this.JPEG),
    ];
  }

  /**
   * Get fixtures by format
   */
  static getByFormat(format: 'png' | 'gif' | 'jpeg'): StampImageFixture[] {
    switch (format) {
      case 'png':
        return Object.values(this.PNG);
      case 'gif':
        return Object.values(this.GIF);
      case 'jpeg':
        return Object.values(this.JPEG);
      default:
        return [];
    }
  }

  /**
   * Get fixtures by size category
   */
  static getBySize(
    category: 'minimal' | 'small' | 'medium' | 'large',
  ): StampImageFixture[] {
    const all = this.getAllFixtures();

    switch (category) {
      case 'minimal':
        return all.filter((f) => f.size < 100);
      case 'small':
        return all.filter((f) => f.size >= 100 && f.size < 1000);
      case 'medium':
        return all.filter((f) => f.size >= 1000 && f.size < 4000);
      case 'large':
        return all.filter((f) => f.size >= 4000);
      default:
        return [];
    }
  }

  /**
   * Get fixture by name for DI
   */
  static getByName(name: string): StampImageFixture | null {
    const all = this.getAllFixtures();
    return all.find((f) => f.name === name) || null;
  }

  /**
   * Create stamp data for testing with fixture
   */
  static createStampData(fixtureName: string, additionalData?: any) {
    const fixture = this.getByName(fixtureName);
    if (!fixture) {
      throw new Error(`Stamp image fixture '${fixtureName}' not found`);
    }

    return {
      imageData: fixture.bytes,
      mimeType: fixture.mimeType,
      filename: `test.${fixture.format}`,
      ...additionalData,
    };
  }
}

/**
 * MIME type validation fixtures
 */
export const MIME_TYPE_FIXTURES = {
  // Valid MIME types for Bitcoin stamps
  valid: [
    'image/png',
    'image/gif',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
  ],

  // Invalid MIME types (should be rejected)
  invalid: [
    'text/plain',
    'application/json',
    'image/bmp',
    'image/tiff',
    'video/mp4',
    'audio/mpeg',
  ],

  // Edge cases for testing
  edgeCases: [
    'image/PNG', // Uppercase
    'Image/gif', // Mixed case
    'IMAGE/JPEG', // All caps
    'image/png ', // Trailing space
    ' image/png', // Leading space
    'image/jpeg;charset=utf-8', // With charset
  ],
};

/**
 * Size limit fixtures for testing constraints
 */
export const SIZE_LIMIT_FIXTURES = {
  // Bitcoin stamp size limits
  maxStampSize: 8192, // 8KB limit for stamps
  testSizes: {
    tiny: 50, // Well under limit
    small: 1000, // Small but reasonable
    medium: 4000, // Medium size
    large: 7000, // Large but valid
    max: 8192, // Exactly at limit
    oversized: 10000, // Over limit (should fail)
  },
};
