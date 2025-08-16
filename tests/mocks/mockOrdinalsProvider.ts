import { vi } from 'vitest';

export const createMockOrdinalsProvider = () => ({
  detectOrdinals: vi.fn().mockResolvedValue(false),
  isOrdinalUtxo: vi.fn().mockReturnValue(false),
  firstSuccessStrategy: vi.fn().mockImplementation(async (utxo) => false),
});

export const createMockMultiProviderDetector = () => ({
  detectOrdinals: vi.fn().mockResolvedValue(false),
  firstSuccessStrategy: vi.fn().mockImplementation(async (utxo) => false),
});
