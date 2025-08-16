import { vi } from 'vitest';
import type { FeeRate } from '../../src/interfaces/fee.interface.ts';

export const createMockFeeProvider = () => {
  const mockFeeRates: FeeRate = {
    low: 5,
    medium: 15,
    high: 30,
    urgent: 50,
  };

  return {
    getMempoolSpaceFeeRates: vi.fn().mockResolvedValue({
      ok: true,
      economyFee: 5,
      hourFee: 15,
      halfHourFee: 30,
      fastestFee: 50,
    }),
    getFeeRates: vi.fn().mockResolvedValue(mockFeeRates),
    getBlockstreamFeeRates: vi.fn().mockResolvedValue({
      '1': 50, // Urgent
      '3': 30, // High
      '6': 15, // Medium
      '25': 5, // Low
    }),
    estimateFee: vi.fn().mockImplementation((txSize, priority = 'medium') => {
      const baseRates = {
        'low': 5,
        'medium': 15,
        'high': 30,
        'urgent': 50,
      };
      const rate = baseRates[priority] || baseRates['medium'];
      return Math.ceil(txSize * rate / 1000);
    }),
    fetchFeeRates: vi.fn().mockResolvedValue({
      lowFee: 5,
      mediumFee: 15,
      highFee: 30,
      urgentFee: 50,
    }),
    estimateTransactionFee: vi.fn().mockImplementation((params) => ({
      estimatedFee: 330,
      feeRate: 15,
      confidence: 0.85,
    })),
    validateFeeRate: vi.fn().mockReturnValue(true),
    testProvider: vi.fn().mockResolvedValue({
      success: true,
      provider: 'mock',
      latency: 10,
    }),
  };
};

export const mockMempoolSpaceResponse = {
  ok: true,
  economyFee: 5,
  hourFee: 15,
  halfHourFee: 30,
  fastestFee: 50,
};

// Global fetch mock to intercept all network calls
export const mockFetch = (responseData: any = mockMempoolSpaceResponse) => {
  const defaultResponse = {
    ...mockMempoolSpaceResponse,
    ok: true,
  };

  const mergedResponse = { ...defaultResponse, ...responseData };

  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    const isMempool = url.includes('mempool.space');
    const isBlockstream = url.includes('blockstream.info');

    const response = isMempool || isBlockstream ? mergedResponse : responseData;

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response)),
    });
  });

  return globalThis.fetch;
};
