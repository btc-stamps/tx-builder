/**
 * SRC-20 Fee Calculator Tests
 *
 * Tests for SRC-20 specific fee calculation functions including stamp-specific
 * fee rules, transaction cost estimation, and fee rate normalization.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';

import {
  createSrc20FeeCalculator,
  Src20FeeCalculator,
  type Src20FeeRules,
  type Src20TransactionParams,
} from '../../../src/utils/src20-fee-calculator';
import type { InputType, OutputType } from '../../../src/interfaces/fee.interface';
import { createMockFeeProvider, mockFetch } from '../../mocks/mockFeeProvider';

describe('Src20FeeCalculator', () => {
  let calculator: Src20FeeCalculator;
  let defaultRules: Src20FeeRules;

  beforeEach(() => {
    // Set up fetch mock to prevent external API calls
    mockFetch();

    defaultRules = {
      preferredFeeRateSatsPerVB: 15,
      priorityMultiplier: 2.0,
      maxDataOutputs: 100,
    };

    calculator = new Src20FeeCalculator(defaultRules);
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default rules', () => {
      const defaultCalculator = new Src20FeeCalculator();
      const rules = defaultCalculator.getStampRules();

      expect(rules.preferredFeeRateSatsPerVB).toBe(15);
      expect(rules.priorityMultiplier).toBe(2.0);
      expect(rules.maxDataOutputs).toBe(100);
    });

    it('should accept custom rules', () => {
      const customRules: Partial<Src20FeeRules> = {
        preferredFeeRateSatsPerVB: 25,
        priorityMultiplier: 3.0,
        maxDataOutputs: 50,
      };

      const customCalculator = new Src20FeeCalculator(customRules);
      const rules = customCalculator.getStampRules();

      expect(rules.preferredFeeRateSatsPerVB).toBe(25);
      expect(rules.priorityMultiplier).toBe(3.0);
      expect(rules.maxDataOutputs).toBe(50);
    });

    it('should update rules after creation', () => {
      const newRules: Partial<Src20FeeRules> = {
        preferredFeeRateSatsPerVB: 20,
      };

      calculator.updateStampRules(newRules);
      const rules = calculator.getStampRules();

      expect(rules.preferredFeeRateSatsPerVB).toBe(20);
      expect(rules.priorityMultiplier).toBe(2.0); // Should remain unchanged
    });
  });

  describe('createSrc20FeeCalculator Factory Function', () => {
    it('should create calculator with default settings', () => {
      const factoryCalculator = createSrc20FeeCalculator();
      expect(factoryCalculator).toBeInstanceOf(Src20FeeCalculator);
    });

    it('should create calculator with custom rules', () => {
      const customRules: Partial<Src20FeeRules> = {
        preferredFeeRateSatsPerVB: 30,
      };

      const factoryCalculator = createSrc20FeeCalculator(customRules);
      const rules = factoryCalculator.getStampRules();

      expect(rules.preferredFeeRateSatsPerVB).toBe(30);
    });
  });

  describe('Stamp Transaction Fee Calculation', () => {
    const mockParams: Src20TransactionParams = {
      stampValue: 330,
      dataOutputCount: 3,
      changeOutputType: 'P2WPKH',
      hasStampInput: false,
      isStampCreation: true,
      isStampTransfer: false,
    };

    const mockInputs = [
      { type: 'P2WPKH' as InputType },
      { type: 'P2WPKH' as InputType },
    ];

    const mockOutputs = [
      { type: 'P2WPKH' as OutputType },
      { type: 'P2WSH' as OutputType },
      { type: 'P2WSH' as OutputType },
      { type: 'P2WSH' as OutputType },
      { type: 'P2WPKH' as OutputType }, // change
    ];

    it('should calculate fee for stamp creation transaction', async () => {
      const feeEstimate = await calculator.calculateStampTransactionFee(
        mockParams,
        mockInputs,
        mockOutputs,
        'medium',
      );

      expect(feeEstimate.totalFee).toBeGreaterThan(0);
      expect(feeEstimate.feeRate).toBeGreaterThan(0);
      expect(feeEstimate.src20Rules.dataOutputCount).toBe(3);
      expect(feeEstimate.src20Rules.appliedMultiplier).toBeGreaterThan(1);
      expect(feeEstimate.normalizedFee.satsPerVB).toBeGreaterThan(0);
      expect(feeEstimate.sizeBreakdown.virtualSize).toBeGreaterThan(0);
    });

    it('should apply higher fees for stamp creation vs transfer', async () => {
      const creationParams = { ...mockParams, isStampCreation: true, isStampTransfer: false };
      const transferParams = { ...mockParams, isStampCreation: false, isStampTransfer: true };

      const creationFee = await calculator.calculateStampTransactionFee(
        creationParams,
        mockInputs,
        mockOutputs,
        'medium',
      );

      const transferFee = await calculator.calculateStampTransactionFee(
        transferParams,
        mockInputs,
        mockOutputs,
        'medium',
      );

      expect(creationFee.totalFee).toBeGreaterThan(transferFee.totalFee);
      expect(creationFee.src20Rules.appliedMultiplier).toBeGreaterThan(
        transferFee.src20Rules.appliedMultiplier,
      );
    });

    it('should scale fees with data output count', async () => {
      const lowDataParams = { ...mockParams, dataOutputCount: 1 };
      const highDataParams = { ...mockParams, dataOutputCount: 10 };

      const lowDataFee = await calculator.calculateStampTransactionFee(
        lowDataParams,
        mockInputs,
        mockOutputs,
        'medium',
      );

      const highDataFee = await calculator.calculateStampTransactionFee(
        highDataParams,
        mockInputs,
        mockOutputs,
        'medium',
      );

      expect(highDataFee.totalFee).toBeGreaterThan(lowDataFee.totalFee);
      expect(highDataFee.src20Rules.recommendedFeeRateSatsPerVB).toBeGreaterThan(
        lowDataFee.src20Rules.recommendedFeeRateSatsPerVB,
      );
    });

    it('should handle different priority levels correctly', async () => {
      const priorities: Array<'low' | 'medium' | 'high' | 'urgent'> = [
        'low',
        'medium',
        'high',
        'urgent',
      ];
      const feeEstimates = [];

      for (const priority of priorities) {
        const estimate = await calculator.calculateStampTransactionFee(
          mockParams,
          mockInputs,
          mockOutputs,
          priority,
        );
        feeEstimates.push({
          priority,
          fee: estimate.totalFee,
          multiplier: estimate.src20Rules.appliedMultiplier,
        });
      }

      // Fees should increase with priority
      expect(feeEstimates[0].fee).toBeLessThan(feeEstimates[1].fee); // low < medium
      expect(feeEstimates[1].fee).toBeLessThan(feeEstimates[2].fee); // medium < high
      expect(feeEstimates[2].fee).toBeLessThan(feeEstimates[3].fee); // high < urgent
    });
  });

  describe('Parameter Validation', () => {
    it('should validate conflicting transaction type flags', async () => {
      const conflictingParams: Src20TransactionParams = {
        stampValue: 330,
        dataOutputCount: 3,
        isStampCreation: true,
        isStampTransfer: true, // Conflict!
      };

      const mockInputs = [{ type: 'P2WPKH' as InputType }];
      const mockOutputs = [{ type: 'P2WPKH' as OutputType }];

      await expect(
        calculator.calculateStampTransactionFee(conflictingParams, mockInputs, mockOutputs),
      ).rejects.toThrow('Cannot have both isStampCreation and isStampTransfer set to true');
    });

    it('should validate data output count limits', async () => {
      const excessiveParams: Src20TransactionParams = {
        stampValue: 330,
        dataOutputCount: 200, // Exceeds default max of 100
      };

      const mockInputs = [{ type: 'P2WPKH' as InputType }];
      const mockOutputs = [{ type: 'P2WPKH' as OutputType }];

      await expect(
        calculator.calculateStampTransactionFee(excessiveParams, mockInputs, mockOutputs),
      ).rejects.toThrow('Data output count 200 exceeds maximum 100');
    });

    it('should warn about large stamp values', async () => {
      const highValueParams: Src20TransactionParams = {
        stampValue: 2_000_000, // 2M sats - triggers warning
        dataOutputCount: 3,
      };

      const mockInputs = [{ type: 'P2WPKH' as InputType }];
      const mockOutputs = [{ type: 'P2WPKH' as OutputType }];

      // Should not throw, but should log warning (we can't easily test console.warn)
      const estimate = await calculator.calculateStampTransactionFee(
        highValueParams,
        mockInputs,
        mockOutputs,
      );

      expect(estimate.totalFee).toBeGreaterThan(0);
    });
  });

  describe('Stamp Transaction Identification', () => {
    it('should identify stamp transactions correctly', () => {
      const stampParams: Src20TransactionParams = {
        stampValue: 330,
        dataOutputCount: 3,
        hasStampInput: true,
      };

      expect(calculator.isStampTransaction(stampParams)).toBe(true);
    });

    it('should identify creation transactions as stamp transactions', () => {
      const creationParams: Src20TransactionParams = {
        stampValue: 330,
        dataOutputCount: 0,
        isStampCreation: true,
      };

      expect(calculator.isStampTransaction(creationParams)).toBe(true);
    });

    it('should identify transfer transactions as stamp transactions', () => {
      const transferParams: Src20TransactionParams = {
        stampValue: 330,
        dataOutputCount: 0,
        isStampTransfer: true,
      };

      expect(calculator.isStampTransaction(transferParams)).toBe(true);
    });

    it('should identify transactions with data outputs as stamp transactions', () => {
      const dataParams: Src20TransactionParams = {
        stampValue: 330,
        dataOutputCount: 5,
      };

      expect(calculator.isStampTransaction(dataParams)).toBe(true);
    });

    it('should not identify regular transactions as stamp transactions', () => {
      const regularParams: Src20TransactionParams = {
        stampValue: 330,
        dataOutputCount: 0,
        hasStampInput: false,
        isStampCreation: false,
        isStampTransfer: false,
      };

      expect(calculator.isStampTransaction(regularParams)).toBe(false);
    });
  });

  describe('Change Output Calculation', () => {
    it('should calculate change correctly', () => {
      const inputValue = 100000;
      const outputValue = 50000;
      const estimatedFee = 2000;

      const changeCalc = calculator.calculateOptimalChange(
        inputValue,
        outputValue,
        estimatedFee,
        'P2WPKH',
      );

      expect(changeCalc.changeValue).toBe(48000); // 100000 - 50000 - 2000
      expect(changeCalc.shouldCreateChange).toBe(true);
      expect(changeCalc.dustThreshold).toBeGreaterThanOrEqual(1000); // Conservative threshold
    });

    it('should not create change for dust amounts', () => {
      const inputValue = 10000;
      const outputValue = 8000;
      const estimatedFee = 1500;

      const changeCalc = calculator.calculateOptimalChange(
        inputValue,
        outputValue,
        estimatedFee,
        'P2WPKH',
      );

      expect(changeCalc.changeValue).toBe(0);
      expect(changeCalc.shouldCreateChange).toBe(false);
    });

    it('should use conservative dust threshold for stamps', () => {
      const changeCalc = calculator.calculateOptimalChange(100000, 50000, 2000, 'P2WPKH');

      // Should be at least 1000 sats for stamps (more conservative than regular transactions)
      expect(changeCalc.dustThreshold).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Fee Rate Recommendations', () => {
    it('should provide fee rate recommendations for different transaction types', () => {
      const recommendations = calculator.getRecommendedFeeRates();

      expect(recommendations.stampCreation.low).toBeGreaterThan(0);
      expect(recommendations.stampCreation.medium).toBeGreaterThan(
        recommendations.stampCreation.low,
      );
      expect(recommendations.stampCreation.high).toBeGreaterThan(
        recommendations.stampCreation.medium,
      );
      expect(recommendations.stampCreation.urgent).toBeGreaterThan(
        recommendations.stampCreation.high,
      );

      expect(recommendations.stampTransfer.medium).toBeLessThan(
        recommendations.stampCreation.medium,
      );
      expect(recommendations.regularWithStamp.medium).toBeLessThan(
        recommendations.stampCreation.medium,
      );
    });

    it('should provide normalized fee rate recommendations', () => {
      const normalizedRecs = calculator.getNormalizedRecommendedFeeRates();

      expect(normalizedRecs.stampCreation.medium.satsPerVB).toBeGreaterThan(0);
      expect(normalizedRecs.stampCreation.medium.unit).toBe('sat/vB');
      expect(normalizedRecs.stampCreation.medium.source).toBe('explorer');

      expect(normalizedRecs.stampTransfer.high.satsPerVB).toBeGreaterThan(
        normalizedRecs.stampTransfer.medium.satsPerVB,
      );
    });
  });

  describe('Transaction Cost Estimation', () => {
    const mockParams: Src20TransactionParams = {
      stampValue: 330,
      dataOutputCount: 3,
      isStampCreation: true,
    };

    const mockInputs = [{ type: 'P2WPKH' as InputType }];
    const mockOutputs = [
      { type: 'P2WSH' as OutputType },
      { type: 'P2WSH' as OutputType },
      { type: 'P2WSH' as OutputType },
      { type: 'P2WPKH' as OutputType },
    ];

    it('should estimate total transaction cost including stamp value', async () => {
      const costEstimate = await calculator.estimateStampTransactionCost(
        mockParams,
        mockInputs,
        mockOutputs,
        'medium',
      );

      expect(costEstimate.stampValue).toBe(330);
      expect(costEstimate.networkFee).toBeGreaterThan(0);
      expect(costEstimate.totalCost).toBe(costEstimate.stampValue + costEstimate.networkFee);

      expect(costEstimate.breakdown.baseTransactionFee).toBeGreaterThan(0);
      expect(costEstimate.breakdown.stampPremium).toBeGreaterThan(0);
      expect(costEstimate.breakdown.dataPremium).toBeGreaterThan(0);
      expect(costEstimate.breakdown.priorityMultiplier).toBeGreaterThan(0);
    });

    it('should show higher costs for stamp creation vs transfer', async () => {
      const creationParams = { ...mockParams, isStampCreation: true, isStampTransfer: false };
      const transferParams = { ...mockParams, isStampCreation: false, isStampTransfer: true };

      const creationCost = await calculator.estimateStampTransactionCost(
        creationParams,
        mockInputs,
        mockOutputs,
        'medium',
      );

      const transferCost = await calculator.estimateStampTransactionCost(
        transferParams,
        mockInputs,
        mockOutputs,
        'medium',
      );

      expect(creationCost.networkFee).toBeGreaterThan(transferCost.networkFee);
      expect(creationCost.breakdown.stampPremium).toBeGreaterThan(
        transferCost.breakdown.stampPremium,
      );
    });

    it('should scale data premium with output count', async () => {
      const lowDataParams = { ...mockParams, dataOutputCount: 1 };
      const highDataParams = { ...mockParams, dataOutputCount: 10 };

      const lowDataCost = await calculator.estimateStampTransactionCost(
        lowDataParams,
        mockInputs,
        mockOutputs,
        'medium',
      );

      const highDataCost = await calculator.estimateStampTransactionCost(
        highDataParams,
        mockInputs,
        mockOutputs,
        'medium',
      );

      expect(highDataCost.breakdown.dataPremium).toBeGreaterThan(lowDataCost.breakdown.dataPremium);
    });
  });

  describe('Fee Rate Normalization', () => {
    it('should handle different input types correctly', async () => {
      const inputTypes: InputType[] = ['P2WPKH', 'P2WSH', 'P2TR'];
      const mockParams: Src20TransactionParams = {
        stampValue: 330,
        dataOutputCount: 2,
      };

      for (const inputType of inputTypes) {
        const inputs = [{ type: inputType }];
        const outputs = [{ type: 'P2WPKH' as OutputType }];

        const estimate = await calculator.calculateStampTransactionFee(
          mockParams,
          inputs,
          outputs,
          'medium',
        );

        expect(estimate.totalFee).toBeGreaterThan(0);
        expect(estimate.normalizedFee.unit).toBe('sat/vB');
      }
    });

    it('should handle witness scripts correctly', async () => {
      const witnessScript = Buffer.from('mock witness script', 'utf8');
      const inputs = [{ type: 'P2WSH' as InputType, witnessScript }];
      const outputs = [{ type: 'P2WPKH' as OutputType }];

      const mockParams: Src20TransactionParams = {
        stampValue: 330,
        dataOutputCount: 1,
      };

      const estimate = await calculator.calculateStampTransactionFee(
        mockParams,
        inputs,
        outputs,
        'medium',
      );

      expect(estimate.sizeBreakdown.witnessSize).toBeGreaterThan(0);
      expect(estimate.sizeBreakdown.virtualSize).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    it('should handle zero stamp value', async () => {
      const zeroValueParams: Src20TransactionParams = {
        stampValue: 0,
        dataOutputCount: 1,
      };

      const mockInputs = [{ type: 'P2WPKH' as InputType }];
      const mockOutputs = [{ type: 'P2WPKH' as OutputType }];

      const estimate = await calculator.calculateStampTransactionFee(
        zeroValueParams,
        mockInputs,
        mockOutputs,
        'medium',
      );

      expect(estimate.totalFee).toBeGreaterThan(0);
    });

    it('should handle zero data outputs', async () => {
      const noDataParams: Src20TransactionParams = {
        stampValue: 330,
        dataOutputCount: 0,
      };

      const mockInputs = [{ type: 'P2WPKH' as InputType }];
      const mockOutputs = [{ type: 'P2WPKH' as OutputType }];

      const estimate = await calculator.calculateStampTransactionFee(
        noDataParams,
        mockInputs,
        mockOutputs,
        'medium',
      );

      expect(estimate.totalFee).toBeGreaterThan(0);
      expect(estimate.src20Rules.dataOutputCount).toBe(0);
    });

    it('should handle maximum allowed data outputs', async () => {
      const maxDataParams: Src20TransactionParams = {
        stampValue: 330,
        dataOutputCount: 100, // At the limit
      };

      const mockInputs = [{ type: 'P2WPKH' as InputType }];
      const mockOutputs = [{ type: 'P2WPKH' as OutputType }];

      const estimate = await calculator.calculateStampTransactionFee(
        maxDataParams,
        mockInputs,
        mockOutputs,
        'medium',
      );

      expect(estimate.totalFee).toBeGreaterThan(0);
      expect(estimate.src20Rules.dataOutputCount).toBe(100);
    });
  });
});
