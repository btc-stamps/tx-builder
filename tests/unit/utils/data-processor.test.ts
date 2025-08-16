/**
 * Data Processor Tests
 *
 * Tests for data processing utilities including format detection,
 * data validation, and utility functions used in stamp creation.
 */

import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';

import { type DataInfo, DataProcessor, STAMP_MAX_SIZE } from '../../../src/utils/data-processor';

describe('DataProcessor', () => {
  describe('Format Detection', () => {
    it('should detect PNG format correctly', () => {
      // PNG signature: 89 50 4E 47 0D 0A 1A 0A
      const pngData = Buffer.from([
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
      ]);
      expect(DataProcessor.detectFormat(pngData)).toBe('PNG');
    });

    it('should detect GIF87a format correctly', () => {
      const gif87aData = Buffer.from('GIF87a\x00\x01\x00\x01\x00\x00\x00', 'binary');
      expect(DataProcessor.detectFormat(gif87aData)).toBe('GIF');
    });

    it('should detect GIF89a format correctly', () => {
      const gif89aData = Buffer.from('GIF89a\x00\x01\x00\x01\x00\x00\x00', 'binary');
      expect(DataProcessor.detectFormat(gif89aData)).toBe('GIF');
    });

    it('should detect JPEG format correctly', () => {
      // JPEG signature: FF D8 FF
      const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      expect(DataProcessor.detectFormat(jpegData)).toBe('JPEG');
    });

    it('should detect WebP format correctly', () => {
      // WebP signature: RIFF + WEBP (needs to be at least 13 bytes)
      const webpData = Buffer.from('RIFF\x00\x00\x00\x00WEBP\x00\x00\x00', 'binary');
      expect(DataProcessor.detectFormat(webpData)).toBe('WEBP');
    });

    it('should detect JSON format correctly', () => {
      const jsonData = Buffer.from('{"key": "value", "number": 42}', 'utf8');
      expect(DataProcessor.detectFormat(jsonData)).toBe('JSON');
    });

    it('should detect JSON array format correctly', () => {
      const jsonArrayData = Buffer.from('[{"key": "value"}, {"key2": "value2"}]', 'utf8');
      expect(DataProcessor.detectFormat(jsonArrayData)).toBe('JSON');
    });

    it('should detect JSON with whitespace correctly', () => {
      const jsonWithSpaces = Buffer.from('  \n  {"formatted": true}  ', 'utf8');
      expect(DataProcessor.detectFormat(jsonWithSpaces)).toBe('JSON');
    });

    it('should detect TEXT format for plain text', () => {
      const textData = Buffer.from('This is a plain text document with readable content.', 'utf8');
      expect(DataProcessor.detectFormat(textData)).toBe('TEXT');
    });

    it('should return UNKNOWN for unrecognized formats', () => {
      // Random binary data
      const unknownData = Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]);
      expect(DataProcessor.detectFormat(unknownData)).toBe('UNKNOWN');
    });

    it('should return UNKNOWN for empty or very small data', () => {
      const emptyData = Buffer.alloc(0);
      const smallData = Buffer.from([0x00, 0x01, 0x02]);

      expect(DataProcessor.detectFormat(emptyData)).toBe('UNKNOWN');
      expect(DataProcessor.detectFormat(smallData)).toBe('UNKNOWN');
    });

    it('should handle incomplete or malformed JSON gracefully', () => {
      const malformedJson = Buffer.from('{"incomplete": tru', 'utf8');
      // This gets detected as TEXT because it's mostly printable characters
      expect(DataProcessor.detectFormat(malformedJson)).toBe('TEXT');
    });

    it('should handle mixed binary/text data', () => {
      // Data that looks like it starts with JSON but has binary data
      const mixedData = Buffer.concat([
        Buffer.from('{"start": "json"', 'utf8'),
        Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]),
      ]);
      expect(DataProcessor.detectFormat(mixedData)).toBe('UNKNOWN');
    });
  });

  describe('Text Detection Heuristics', () => {
    it('should identify mostly printable text as TEXT', () => {
      const printableText = Buffer.from('Hello World! This is 99% printable text.', 'utf8');
      expect(DataProcessor.detectFormat(printableText)).toBe('TEXT');
    });

    it('should not identify binary data as text', () => {
      // Mostly non-printable bytes
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0xff, 0xfe, 0xfd]);
      expect(DataProcessor.detectFormat(binaryData)).toBe('UNKNOWN');
    });

    it('should handle text with common whitespace characters', () => {
      const textWithWhitespace = Buffer.from('Line 1\nLine 2\tTabbed\rCarriage Return', 'utf8');
      expect(DataProcessor.detectFormat(textWithWhitespace)).toBe('TEXT');
    });

    it('should handle edge case of >90% printable characters', () => {
      // Create data that is >90% printable (should be detected as text)
      // 9 printable chars + 1 non-printable = exactly 90% (not detected as text)
      // 10 printable chars + 1 non-printable = >90% (detected as text)
      const printableChars = Buffer.from('abcdefghij', 'utf8'); // 10 printable chars
      const nonPrintableChar = Buffer.from([0x00]); // 1 non-printable char
      const edgeCaseData = Buffer.concat([printableChars, nonPrintableChar]);

      // 10/11 = ~91% which is >90%, so should be detected as TEXT
      expect(DataProcessor.detectFormat(edgeCaseData)).toBe('TEXT');
    });
  });

  describe('Data URL Creation', () => {
    it('should create data URL with explicit MIME type', () => {
      const data = Buffer.from('Hello World', 'utf8');
      const dataUrl = DataProcessor.createDataURL(data, 'text/plain');

      expect(dataUrl).toMatch(/^data:text\/plain;base64,/);
      expect(dataUrl).toContain(data.toString('base64'));
    });

    it('should auto-detect MIME type for PNG', () => {
      const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const dataUrl = DataProcessor.createDataURL(pngData);

      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('should auto-detect MIME type for GIF', () => {
      const gifData = Buffer.from('GIF89a\x00\x01\x00\x01\x00\x00\x00', 'binary');
      const dataUrl = DataProcessor.createDataURL(gifData);

      expect(dataUrl).toMatch(/^data:image\/gif;base64,/);
    });

    it('should auto-detect MIME type for JPEG', () => {
      const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const dataUrl = DataProcessor.createDataURL(jpegData);

      expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('should auto-detect MIME type for WebP', () => {
      const webpData = Buffer.from('RIFF\x00\x00\x00\x00WEBP\x00\x00\x00', 'binary');
      const dataUrl = DataProcessor.createDataURL(webpData);

      expect(dataUrl).toMatch(/^data:image\/webp;base64,/);
    });

    it('should auto-detect MIME type for JSON', () => {
      const jsonData = Buffer.from('{"test": true}', 'utf8');
      const dataUrl = DataProcessor.createDataURL(jsonData);

      expect(dataUrl).toMatch(/^data:application\/json;base64,/);
    });

    it('should auto-detect MIME type for text', () => {
      const textData = Buffer.from('Plain text content', 'utf8');
      const dataUrl = DataProcessor.createDataURL(textData);

      expect(dataUrl).toMatch(/^data:text\/plain;base64,/);
    });

    it('should use octet-stream for unknown formats', () => {
      const unknownData = Buffer.from([0x12, 0x34, 0x56, 0x78]);
      const dataUrl = DataProcessor.createDataURL(unknownData);

      expect(dataUrl).toMatch(/^data:application\/octet-stream;base64,/);
    });

    it('should encode data correctly in base64', () => {
      const testData = Buffer.from('Test data for base64 encoding', 'utf8');
      const expectedBase64 = testData.toString('base64');
      const dataUrl = DataProcessor.createDataURL(testData, 'text/plain');

      expect(dataUrl).toContain(expectedBase64);
    });
  });

  describe('Data Info Generation', () => {
    it('should return correct data info for PNG', () => {
      const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const info: DataInfo = DataProcessor.getDataInfo(pngData);

      expect(info.format).toBe('PNG');
      expect(info.size).toBe(pngData.length);
    });

    it('should return correct data info for text', () => {
      const textData = Buffer.from('Sample text content', 'utf8');
      const info: DataInfo = DataProcessor.getDataInfo(textData);

      expect(info.format).toBe('TEXT');
      expect(info.size).toBe(textData.length);
    });

    it('should return correct data info for unknown format', () => {
      const unknownData = Buffer.from([0xff, 0xaa, 0xbb, 0xcc]);
      const info: DataInfo = DataProcessor.getDataInfo(unknownData);

      expect(info.format).toBe('UNKNOWN');
      expect(info.size).toBe(unknownData.length);
    });

    it('should handle empty data', () => {
      const emptyData = Buffer.alloc(0);
      const info: DataInfo = DataProcessor.getDataInfo(emptyData);

      expect(info.format).toBe('UNKNOWN');
      expect(info.size).toBe(0);
    });
  });

  describe('Size Validation', () => {
    it('should return false for data within size limit', () => {
      const smallData = Buffer.alloc(1000); // 1KB - well under limit
      expect(DataProcessor.exceedsMaxSize(smallData)).toBe(false);
    });

    it('should return false for data at exactly the size limit', () => {
      const maxSizeData = Buffer.alloc(STAMP_MAX_SIZE); // Exactly at limit
      expect(DataProcessor.exceedsMaxSize(maxSizeData)).toBe(false);
    });

    it('should return true for data exceeding size limit', () => {
      const oversizedData = Buffer.alloc(STAMP_MAX_SIZE + 1); // Over limit
      expect(DataProcessor.exceedsMaxSize(oversizedData)).toBe(true);
    });

    it('should handle empty data correctly', () => {
      const emptyData = Buffer.alloc(0);
      expect(DataProcessor.exceedsMaxSize(emptyData)).toBe(false);
    });

    it('should validate against the correct size constant', () => {
      expect(STAMP_MAX_SIZE).toBe(100000); // 100KB Bitcoin transaction limit
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null or undefined data gracefully', () => {
      // These should crash for null/undefined because they're not Buffers
      expect(() => DataProcessor.detectFormat(null as any)).toThrow();
      expect(() => DataProcessor.detectFormat(undefined as any)).toThrow();
    });

    it('should handle very large text samples in text detection', () => {
      // Create a large text buffer
      const largeText = Buffer.from('A'.repeat(10000), 'utf8');
      expect(DataProcessor.detectFormat(largeText)).toBe('TEXT');
    });

    it('should handle mixed content that starts with valid format signatures', () => {
      // PNG signature followed by random data
      const mixedPngData = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('not really png data', 'utf8'),
      ]);
      expect(DataProcessor.detectFormat(mixedPngData)).toBe('PNG'); // Still detected as PNG
    });

    it('should handle WebP with insufficient header length', () => {
      // WebP signature but too short
      const shortWebpData = Buffer.from('RIFF\x00\x00\x00\x00WEB', 'binary'); // Missing 'P'
      expect(DataProcessor.detectFormat(shortWebpData)).toBe('UNKNOWN');
    });

    it('should validate consistent behavior across multiple calls', () => {
      const testData = Buffer.from('{"consistent": "test"}', 'utf8');

      // Multiple calls should return the same result
      expect(DataProcessor.detectFormat(testData)).toBe('JSON');
      expect(DataProcessor.detectFormat(testData)).toBe('JSON');
      expect(DataProcessor.detectFormat(testData)).toBe('JSON');
    });
  });

  describe('Real-world Data Scenarios', () => {
    it('should handle typical Bitcoin stamp data scenarios', () => {
      // Small image data
      const smallImageData = Buffer.from([
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
      ]);
      expect(DataProcessor.detectFormat(smallImageData)).toBe('PNG');
      expect(DataProcessor.exceedsMaxSize(smallImageData)).toBe(false);
    });

    it('should handle metadata JSON commonly used in stamps', () => {
      const stampMetadata = Buffer.from(
        JSON.stringify({
          name: 'My Bitcoin Stamp',
          description: 'A unique digital collectible',
          image:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          attributes: [
            { trait_type: 'Color', value: 'Blue' },
            { trait_type: 'Rarity', value: 'Common' },
          ],
        }),
        'utf8',
      );

      expect(DataProcessor.detectFormat(stampMetadata)).toBe('JSON');
      expect(DataProcessor.exceedsMaxSize(stampMetadata)).toBe(false);
    });

    it('should handle simple text messages in stamps', () => {
      const textMessage = Buffer.from(
        'Hello Bitcoin Stamps Community! This is a text-based stamp.',
        'utf8',
      );

      expect(DataProcessor.detectFormat(textMessage)).toBe('TEXT');
      expect(DataProcessor.exceedsMaxSize(textMessage)).toBe(false);

      const dataUrl = DataProcessor.createDataURL(textMessage);
      expect(dataUrl).toMatch(/^data:text\/plain;base64,/);
    });

    it('should handle binary data that might be compressed', () => {
      // Simulate compressed data (starts with binary patterns)
      const compressedData = Buffer.from([
        0x1f,
        0x8b,
        0x08,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x02,
        0xff,
      ]);

      expect(DataProcessor.detectFormat(compressedData)).toBe('UNKNOWN');
      expect(DataProcessor.exceedsMaxSize(compressedData)).toBe(false);
    });
  });
});
