import { vi } from 'vitest';
import { Buffer } from 'node:buffer';

export const createBaseOrdinalDetector = () => ({
  getInscriptionData: vi.fn().mockResolvedValue({
    id: 'mock_inscription_id',
    number: 1,
    content: {
      type: 'text',
      data: 'mock inscription data',
    },
    owner: 'bc1qtest',
    timestamp: new Date().toISOString(),
    size: 100,
    contentType: 'text/plain',
  }),

  isOrdinalUtxo: vi.fn().mockResolvedValue(false),

  detectOrdinals: vi.fn().mockResolvedValue(false),

  firstSuccessStrategy: vi.fn().mockImplementation(async (utxo) => {
    return {
      detected: false,
      type: 'none',
      details: null,
    };
  }),

  resolveInscriptionContent: vi.fn().mockResolvedValue({
    resolved: true,
    content: Buffer.from('mock content'),
    contentType: 'text/plain',
  }),

  validateInscription: vi.fn().mockReturnValue({
    valid: true,
    details: {
      type: 'text',
      size: 100,
      encoding: 'utf-8',
    },
  }),

  handleRateLimiting: vi.fn().mockImplementation(async (fn) => {
    try {
      return await fn();
    } catch (error) {
      // Simulated rate limiting handling
      return { rateLimited: true };
    }
  }),
});

export const createMockOrdServerDetector = () => ({
  ...createBaseOrdinalDetector(),

  // Add any specific OrdServerDetector methods
  fetchOrdinalData: vi.fn().mockResolvedValue({
    inscriptions: [{
      id: 'mock_inscription_id',
      number: 1,
      content: {
        type: 'text',
        data: 'mock ord server inscription',
      },
    }],
  }),
});

export const createMockHiroOrdinalsDetector = () => ({
  ...createBaseOrdinalDetector(),

  // Add any specific HiroOrdinals methods
  fetchHiroData: vi.fn().mockResolvedValue({
    inscriptions: [{
      id: 'mock_hiro_inscription_id',
      number: 1,
      content: {
        type: 'runes',
        data: 'mock hiro runes data',
      },
    }],
  }),
});
