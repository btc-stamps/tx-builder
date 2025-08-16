import { vi } from 'vitest';

export const createMockFetch = () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        fastestFee: 50,
        halfHourFee: 30,
        hourFee: 20,
        minimumFee: 10,
      }),
    status: 200,
    statusText: 'OK',
  });

  return globalThis.fetch;
};
