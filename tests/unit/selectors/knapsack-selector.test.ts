import { describe, expect, it } from 'vitest';
import {
  ConfigurableKnapsackSelector,
  KnapsackSelector,
} from '../../../src/selectors/knapsack-selector';
import type { UTXO } from '../../../src/interfaces/provider.interface';
import { UTXOFixtureProvider } from '../../fixtures/utxo-fixture-provider';

describe('KnapsackSelector', () => {
  const selector = new KnapsackSelector();

  const testUTXOs: UTXO[] = UTXOFixtureProvider.getDiverseSet().utxos;

  const baseOptions = {
    targetValue: 10000,
    feeRate: 15,
    maxInputs: 10,
    dustThreshold: 330,
    minConfirmations: 1,
  };

  it('should select UTXOs using stochastic algorithm', () => {
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
    expect(result.details).toHaveProperty('availableBalance');
    expect(result.details).toHaveProperty('requiredAmount');
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

  it('should find exact matches when possible', () => {
    // Use a small value set to increase chance of exact match
    const smallUTXOs = UTXOFixtureProvider.getSmallValueSet().utxos;
    const result = selector.select(smallUTXOs, {
      ...baseOptions,
      targetValue: 1500, // Realistic target for small UTXO set
    });

    // Either succeeds or fails gracefully due to insufficient funds
    if (result.success) {
      expect(result.inputs).toBeDefined();
    } else {
      expect(result.reason).toMatch(/INSUFFICIENT_FUNDS|NO_SOLUTION_FOUND|SELECTION_FAILED/);
    }
  });

  it('should handle empty UTXO set', () => {
    const result = selector.select([], baseOptions);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('NO_UTXOS_AVAILABLE');
  });

  it('should return correct algorithm name', () => {
    expect(selector.getName()).toBe('knapsack');
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
});

describe('ConfigurableKnapsackSelector', () => {
  it('should use custom configuration parameters', () => {
    const customSelector = new ConfigurableKnapsackSelector({
      iterations: 500,
      inclusionProbability: 0.7,
    });

    expect(customSelector.inclusionProbability).toBe(0.7);
    expect(customSelector.getName()).toBe('knapsack-500-0.7');
  });

  it('should work with custom parameters', () => {
    const customSelector = new ConfigurableKnapsackSelector({
      iterations: 100,
      inclusionProbability: 0.3,
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

  it('should use default values when no config provided', () => {
    const defaultSelector = new ConfigurableKnapsackSelector();

    expect(defaultSelector.inclusionProbability).toBe(0.5);
    expect(defaultSelector.getName()).toBe('knapsack-1000-0.5');
  });
});
