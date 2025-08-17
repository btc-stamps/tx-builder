import { describe, expect, it } from 'vitest';
import { WasteOptimizedSelector } from '../../../src/selectors/waste-optimized';
import type { UTXO } from '../../../src/interfaces/provider.interface';
import { UTXOFixtureProvider } from '../../fixtures/utxo-fixture-provider';

describe('WasteOptimizedSelector', () => {
  const selector = new WasteOptimizedSelector();

  const testUTXOs: UTXO[] = UTXOFixtureProvider.getDiverseSet().utxos;

  const baseOptions = {
    targetValue: 10000,
    feeRate: 15,
    maxInputs: 10,
    dustThreshold: 330,
    minConfirmations: 1,
  };

  it('should select UTXOs using waste optimization', () => {
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
    expect(result.details).toHaveProperty('utxoCount', 0);
  });

  it('should return correct algorithm name', () => {
    expect(selector.getName()).toBe('waste-optimized');
  });

  it('should respect maxInputs constraint', () => {
    const result = selector.select(testUTXOs, {
      ...baseOptions,
      maxInputs: 2,
    });

    if (result.success) {
      expect(result.inputs!.length).toBeLessThanOrEqual(2);
    } else {
      // If it fails with maxInputs=2, that's also acceptable
      expect(result.reason).toBeDefined();
    }
  });

  it('should handle dust UTXOs appropriately', () => {
    // Create UTXOs below dust threshold
    const dustUTXOs: UTXO[] = [
      {
        txid: 'dust1',
        vout: 0,
        value: 100, // Below dust threshold
        scriptPubKey: '0014test',
        confirmations: 6,
      },
      {
        txid: 'dust2',
        vout: 0,
        value: 200, // Below dust threshold
        scriptPubKey: '0014test',
        confirmations: 6,
      },
    ];

    const result = selector.select(dustUTXOs, baseOptions);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/INSUFFICIENT_FUNDS|NO_UTXOS_AVAILABLE/);
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

  it('should work with different target values', () => {
    // Test with small target that should be easily achievable
    const smallTargetResult = selector.select(testUTXOs, {
      ...baseOptions,
      targetValue: 2000,
    });

    expect(smallTargetResult.success).toBe(true);
    expect(smallTargetResult.inputs).toBeDefined();
  });
});

describe('WasteOptimizedSelector with custom config', () => {
  it('should work with custom waste weighting', () => {
    const customSelector = new WasteOptimizedSelector({
      wasteWeighting: {
        changeCost: 2.0,
        excessCost: 1.0,
        inputCost: 0.2,
      },
    });

    const testUTXOs = UTXOFixtureProvider.getDiverseSet().utxos;
    const result = customSelector.select(testUTXOs, {
      targetValue: 5000,
      feeRate: 10,
      maxInputs: 5,
      dustThreshold: 330,
      minConfirmations: 1,
    });

    expect(result.success).toBe(true);
    expect(result.inputs).toBeDefined();
  });

  it('should work with limited algorithms', () => {
    const limitedSelector = new WasteOptimizedSelector({
      algorithms: ['accumulative', 'blackjack'],
    });

    expect(limitedSelector.getName()).toBe('waste-optimized');

    const testUTXOs = UTXOFixtureProvider.getSmallValueSet().utxos;
    const result = limitedSelector.select(testUTXOs, {
      targetValue: 1500,
      feeRate: 15,
      maxInputs: 3,
      dustThreshold: 330,
      minConfirmations: 1,
    });

    // Either succeeds or fails gracefully due to insufficient funds
    if (result.success) {
      expect(result.inputs).toBeDefined();
    } else {
      expect(result.reason).toMatch(/INSUFFICIENT_FUNDS|NO_SOLUTION_FOUND|SELECTION_FAILED/);
    }
  });
});
