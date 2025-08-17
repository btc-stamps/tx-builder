import { describe, expect, it } from 'vitest';
import { BlackjackSelector } from '../../../src/selectors/blackjack';
import type { UTXO } from '../../../src/interfaces/provider.interface';
import { UTXOFixtureProvider } from '../../fixtures/utxo-fixture-provider';

describe('BlackjackSelector', () => {
  const selector = new BlackjackSelector();

  const testUTXOs: UTXO[] = UTXOFixtureProvider.getDiverseSet().utxos;

  const baseOptions = {
    targetValue: 10000,
    feeRate: 15,
    maxInputs: 10,
    dustThreshold: 330,
    minConfirmations: 1,
  };

  it('should select UTXOs matching target value exactly', () => {
    const result = selector.select(testUTXOs, baseOptions);

    expect(result.success).toBe(true);
    expect(result.inputs).toBeDefined();
    expect(result.inputs!.length).toBeGreaterThan(0);

    const totalSelected = result.inputs!.reduce((sum, utxo) => sum + utxo.value, 0);
    const requiredAmount = baseOptions.targetValue + result.fee!;

    expect(Math.abs(totalSelected - requiredAmount)).toBeLessThanOrEqual(300); // reasonable tolerance
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

    // With maxInputs=1, it might succeed or fail depending on UTXO values
    if (result.success) {
      expect(result.inputs!.length).toBeLessThanOrEqual(1);
    } else {
      // If it fails, it should be due to insufficient funds, no solution, or selection failed
      expect(result.reason).toMatch(/INSUFFICIENT_FUNDS|NO_SOLUTION_FOUND|SELECTION_FAILED/);
    }
  });

  it('should use optimized selection method', () => {
    const result = selector.selectOptimized(testUTXOs, baseOptions);

    expect(result.success).toBe(true);
    expect(result.inputs).toBeDefined();
    expect(result.inputs!.length).toBeGreaterThan(0);
  });

  it('should return stats about selection algorithm', () => {
    const stats = selector.getStats();

    expect(stats.maxCombinations).toBeGreaterThan(0);
    expect(stats.exactMatchTolerance).toBeDefined();
  });

  it('should provide detailed failure information', () => {
    const result = selector.select(testUTXOs, {
      ...baseOptions,
      targetValue: 1000000, // Extremely high target
    });

    expect(result.success).toBe(false);
    expect(result.details).toHaveProperty('availableBalance');
    expect(result.details).toHaveProperty('requiredAmount');
    expect(result.details).toHaveProperty('utxoCount');
    expect(result.details).toHaveProperty('targetValue');
  });
});
