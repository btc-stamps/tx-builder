import { vi } from 'vitest';
import { createMockUtxoSet } from '../fixtures/utxos';

export const createMockSelector = () => ({
  select: vi.fn().mockImplementation((utxos, options = {}) => {
    if (!utxos || utxos.length === 0) return null;

    const selectedUtxos = utxos.length > 1
      ? utxos.slice(0, 2) // Take first two UTXOs
      : utxos;

    const totalValue = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
    const estimatedFee = 330; // Consistent with test expectations

    return {
      inputs: selectedUtxos,
      totalValue,
      fee: estimatedFee,
      change: Math.max(0, totalValue - estimatedFee),
    };
  }),
  createSelectionStrategy: vi.fn().mockReturnValue({
    select: vi.fn().mockImplementation((utxos, options = {}) => {
      return createMockSelector().select(utxos, options);
    }),
  }),
});

export const createComplexSelector = () => {
  const baseMockSelector = createMockSelector();

  return {
    ...baseMockSelector,
    select: vi.fn().mockImplementation((utxos, options = {}) => {
      const mockUtxos = utxos.length === 0 ? createMockUtxoSet() : utxos;

      const {
        avoidHighValueUtxos = false,
        maxInputs = 5,
        targetValue,
      } = options;

      let selectableUtxos = mockUtxos;

      if (avoidHighValueUtxos) {
        selectableUtxos = selectableUtxos.filter((utxo) => utxo.value < 50000);
      }

      selectableUtxos.sort((a, b) => b.value - a.value);
      const selectedUtxos = selectableUtxos.slice(0, maxInputs);

      const totalValue = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
      const estimatedFee = targetValue ? Math.max(330, Math.ceil(totalValue * 0.01)) : 330;

      return {
        inputs: selectedUtxos,
        totalValue,
        fee: estimatedFee,
        change: Math.max(0, totalValue - estimatedFee),
      };
    }),
  };
};
