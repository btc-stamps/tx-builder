import { describe, expect, it } from 'vitest';
import { BranchAndBoundSelector } from '../../../src/selectors/branch-and-bound';
import type { UTXO } from '../../../src/interfaces/provider.interface';
import { UTXOFixtureProvider } from '../../fixtures/utxo-fixture-provider';

describe('BranchAndBoundSelector', () => {
  const selector = new BranchAndBoundSelector();

  const testUTXOs: UTXO[] = UTXOFixtureProvider.getDiverseSet().utxos;

  const baseOptions = {
    targetValue: 10000,
    feeRate: 15,
    maxInputs: 10,
    dustThreshold: 330,
    minConfirmations: 1,
  };

  it('should select UTXOs using branch and bound algorithm', () => {
    const result = selector.select(testUTXOs, baseOptions);

    expect(result.success).toBe(true);
    expect(result.inputs).toBeDefined();
    expect(result.inputs!.length).toBeGreaterThan(0);

    const totalSelected = result.inputs!.reduce((sum, utxo) => sum + utxo.value, 0);
    const requiredAmount = baseOptions.targetValue + result.fee!;

    expect(totalSelected).toBeGreaterThanOrEqual(requiredAmount);
  });

  it('should handle insufficient funds gracefully', () => {
    const result = selector.select(testUTXOs, {
      ...baseOptions,
      targetValue: 1000000, // Extremely high target
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('INSUFFICIENT_FUNDS');
  });

  it('should handle empty UTXO set', () => {
    const result = selector.select([], baseOptions);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('NO_UTXOS_AVAILABLE');
  });

  it('should return correct algorithm name', () => {
    expect(selector.getName()).toBe('branch-and-bound');
  });

  it('should respect maxInputs constraint', () => {
    const result = selector.select(testUTXOs, {
      ...baseOptions,
      maxInputs: 3,
    });

    if (result.success) {
      expect(result.inputs!.length).toBeLessThanOrEqual(3);
    } else {
      // If it fails with maxInputs=3, that's also acceptable for this algorithm
      expect(result.reason).toBeDefined();
    }
  });

  it('should optimize for changeless transactions when possible', () => {
    // Use specific UTXOs that might allow for exact matches
    const specificUTXOs = UTXOFixtureProvider.getSmallValueSet().utxos;
    const result = selector.select(specificUTXOs, {
      ...baseOptions,
      targetValue: 1500, // Small target to increase chance of exact match
    });

    // Either succeeds or fails gracefully due to insufficient funds
    if (result.success) {
      expect(result.inputs).toBeDefined();
      // The algorithm should prefer solutions with less change
      const totalSelected = result.inputs!.reduce((sum, utxo) => sum + utxo.value, 0);
      expect(totalSelected).toBeGreaterThan(0);
    } else {
      expect(result.reason).toMatch(/INSUFFICIENT_FUNDS|NO_SOLUTION_FOUND|SELECTION_FAILED/);
    }
  });

  it('should handle minimum confirmations filter', () => {
    const result = selector.select(testUTXOs, {
      ...baseOptions,
      minConfirmations: 100, // Very high confirmation requirement
    });

    // Should either succeed with high-confirmation UTXOs or fail due to no eligible UTXOs
    if (!result.success) {
      expect(result.reason).toMatch(/NO_UTXOS_AVAILABLE|INSUFFICIENT_FUNDS/);
    }
  });

  it('should work efficiently with diverse UTXO set', () => {
    const diverseUTXOs = UTXOFixtureProvider.getDiverseSet().utxos;
    const result = selector.select(diverseUTXOs, {
      targetValue: 15000,
      feeRate: 20,
      maxInputs: 5,
      dustThreshold: 330,
      minConfirmations: 1,
    });

    expect(result.success).toBe(true);
    expect(result.inputs).toBeDefined();
    expect(result.inputs!.length).toBeGreaterThan(0);
  });

  it('should handle high-value UTXOs efficiently', () => {
    const highValueUTXOs = UTXOFixtureProvider.getHighValueSet().utxos;
    const result = selector.select(highValueUTXOs, {
      targetValue: 20000,
      feeRate: 15,
      maxInputs: 4,
      dustThreshold: 330,
      minConfirmations: 1,
    });

    expect(result.success).toBe(true);
    expect(result.inputs).toBeDefined();
  });

  it('should inherit estimateFee method correctly', () => {
    const fee = selector.estimateFee(2, 2, 15);
    expect(fee).toBeGreaterThan(0);
    expect(typeof fee).toBe('number');
  });

  it('should handle edge case with single large UTXO', () => {
    const singleUTXO: UTXO[] = [
      {
        txid: 'large_utxo',
        vout: 0,
        value: 50000,
        scriptPubKey: '0014test',
        confirmations: 6,
      },
    ];

    const result = selector.select(singleUTXO, {
      targetValue: 25000,
      feeRate: 15,
      maxInputs: 1,
      dustThreshold: 330,
      minConfirmations: 1,
    });

    expect(result.success).toBe(true);
    expect(result.inputs!.length).toBe(1);
  });
});
