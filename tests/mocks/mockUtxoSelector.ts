import { vi } from 'vitest';

export const createMockUtxoSelector = () => ({
  select: vi.fn().mockImplementation((utxos, options) => {
    if (!utxos || utxos.length === 0) return null;

    const sortedUtxos = utxos.sort((a, b) => b.value - a.value);
    const selectedInputs = sortedUtxos.slice(0, 2);
    const totalValue = selectedInputs.reduce((sum, utxo) => sum + utxo.value, 0);

    return {
      inputs: selectedInputs,
      totalValue: totalValue,
      fee: 330, // Match the expected fee in test cases
      change: Math.max(0, totalValue - 330),
    };
  }),
});
