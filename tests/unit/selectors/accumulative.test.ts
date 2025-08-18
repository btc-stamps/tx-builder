import { describe, expect, it } from 'vitest';
import { AccumulativeSelector } from '../../../src/selectors/accumulative';
import type { UTXO } from '../../../src/interfaces/provider.interface';
import { UTXOFixtureProvider } from '../../fixtures/utxo-fixture-provider';

describe('AccumulativeSelector', () => {
  const selector = new AccumulativeSelector();

  const testUTXOs: UTXO[] = UTXOFixtureProvider.getDiverseSet().utxos;

  const baseOptions = {
    targetValue: 10000,
    feeRate: 15,
    maxInputs: 10,
    dustThreshold: 330,
    minConfirmations: 1,
  };

  it('should select UTXOs to meet target value', () => {
    const result = selector.select(testUTXOs, baseOptions);

    expect(result.success).toBe(true);
    expect(result.inputs).toBeDefined();
    expect(result.inputs!.length).toBeGreaterThan(0);

    const totalSelected = result.inputs!.reduce((sum, utxo) => sum + utxo.value, 0);
    const requiredAmount = baseOptions.targetValue + result.fee!;

    expect(totalSelected).toBeGreaterThanOrEqual(requiredAmount);
  });

  it('should handle insufficient funds', () => {
    const result = selector.select(testUTXOs, {
      ...baseOptions,
      targetValue: 1000000, // Extremely high target
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('INSUFFICIENT_FUNDS');
  });

  it('should respect maxInputs constraint', () => {
    const result = selector.select(testUTXOs, {
      ...baseOptions,
      maxInputs: 1,
    });

    expect(result.success).toBe(true);
    expect(result.inputs!.length).toBe(1);
  });

  it('should find FIFO selection strategy', () => {
    const result = selector.selectFIFO(testUTXOs, baseOptions);

    expect(result.success).toBe(true);
    expect(result.inputs).toBeDefined();
    expect(result.inputs!.length).toBeGreaterThan(0);
  });

  it('should perform consolidation selection', () => {
    const result = selector.selectForConsolidation(testUTXOs, baseOptions);

    expect(result.success).toBe(true);
    expect(result.inputs).toBeDefined();
    expect(result.inputs!.length).toBeGreaterThan(0);
  });
});
