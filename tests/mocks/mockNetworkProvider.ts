import { vi } from 'vitest';

export const createMockNetworkProvider = () => ({
  getUTXOs: vi.fn().mockResolvedValue([]),
  broadcastTransaction: vi.fn().mockResolvedValue('mock_txid'),
  getTransaction: vi.fn().mockResolvedValue(null),
  getTransactionConfirmations: vi.fn().mockResolvedValue(0),
  estimateFee: vi.fn().mockResolvedValue({
    low: 5,
    medium: 15,
    high: 30,
    urgent: 50,
  }),
  testConnection: vi.fn().mockResolvedValue({
    success: true,
    latency: 10,
    provider: 'mock',
  }),
});

export const createMockMultiNetworkProvider = () => ({
  providers: [createMockNetworkProvider()],
  getUTXOs: vi.fn().mockImplementation(async (address, options) => {
    const mockProvider = createMockNetworkProvider();
    return mockProvider.getUTXOs(address, options);
  }),
  broadcastTransaction: vi.fn().mockResolvedValue('mock_txid'),
  fallbackStrategy: vi.fn().mockImplementation(async (method, ...args) => {
    const mockProvider = createMockNetworkProvider();
    return mockProvider[method](...args);
  }),
});
