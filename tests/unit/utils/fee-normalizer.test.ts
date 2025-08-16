/**
 * Fee Normalizer Tests
 *
 * Tests for fee conversion utilities and virtual size calculations.
 * Validates standardization to satsPerVB and transaction size calculations.
 */

import { describe, expect, it } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import { Buffer } from 'node:buffer';

import {
  calculateNormalizedFee,
  createNormalizedFeeRate,
  FeeNormalizer,
  type FeePriority,
  type FeeSource,
  type FeeUnit,
  getFeeLevelsEstimate,
  type NormalizedFeeRate,
  validateAndNormalizeFee,
} from '../../../src/utils/fee-normalizer.ts';

describe('FeeNormalizer', () => {
  describe('Unit conversion methods', () => {
    describe('toSatsPerVB', () => {
      it('should convert sat/vB correctly (passthrough)', () => {
        expect(FeeNormalizer.toSatsPerVB(10, 'sat/vB')).toBe(10);
        expect(FeeNormalizer.toSatsPerVB(15.7, 'sat/vB')).toBe(16); // Ceiled
        expect(FeeNormalizer.toSatsPerVB(1, 'sat/vB')).toBe(1);
      });

      it('should convert sat/byte correctly', () => {
        expect(FeeNormalizer.toSatsPerVB(10, 'sat/byte')).toBe(10);
        expect(FeeNormalizer.toSatsPerVB(15.3, 'sat/byte')).toBe(16); // Ceiled
        expect(FeeNormalizer.toSatsPerVB(0.5, 'sat/byte')).toBe(1); // Ceiled
      });

      it('should convert btc/kb correctly', () => {
        // 0.0001 BTC/kB = 10,000 sats/kB = 10 sats/vB
        expect(FeeNormalizer.toSatsPerVB(0.0001, 'btc/kb')).toBe(10);

        // 0.00005 BTC/kB = 5,000 sats/kB = 5 sats/vB
        expect(FeeNormalizer.toSatsPerVB(0.00005, 'btc/kb')).toBe(5);

        // 0.00001 BTC/kB = 1,000 sats/kB = 1 sats/vB
        expect(FeeNormalizer.toSatsPerVB(0.00001, 'btc/kb')).toBe(1);
      });

      it('should handle edge cases', () => {
        expect(FeeNormalizer.toSatsPerVB(0, 'sat/vB')).toBe(0);
        expect(FeeNormalizer.toSatsPerVB(0.1, 'sat/vB')).toBe(1); // Ceiled
        expect(FeeNormalizer.toSatsPerVB(1000, 'sat/vB')).toBe(1000);
      });

      it('should throw error for unsupported units', () => {
        expect(() => FeeNormalizer.toSatsPerVB(10, 'invalid' as FeeUnit)).toThrow(
          'Unsupported fee unit',
        );
      });
    });

    describe('fromSatsPerVB', () => {
      it('should convert to sat/vB correctly (passthrough)', () => {
        expect(FeeNormalizer.fromSatsPerVB(10, 'sat/vB')).toBe(10);
        expect(FeeNormalizer.fromSatsPerVB(15, 'sat/vB')).toBe(15);
        expect(FeeNormalizer.fromSatsPerVB(1, 'sat/vB')).toBe(1);
      });

      it('should convert to sat/byte correctly (same as sat/vB)', () => {
        expect(FeeNormalizer.fromSatsPerVB(10, 'sat/byte')).toBe(10);
        expect(FeeNormalizer.fromSatsPerVB(15, 'sat/byte')).toBe(15);
        expect(FeeNormalizer.fromSatsPerVB(1, 'sat/byte')).toBe(1);
      });

      it('should convert to btc/kb correctly', () => {
        // 10 sats/vB = 10,000 sats/kB = 0.0001 BTC/kB
        expect(FeeNormalizer.fromSatsPerVB(10, 'btc/kb')).toBe(0.0001);

        // 5 sats/vB = 5,000 sats/kB = 0.00005 BTC/kB
        expect(FeeNormalizer.fromSatsPerVB(5, 'btc/kb')).toBe(0.00005);

        // 1 sats/vB = 1,000 sats/kB = 0.00001 BTC/kB
        expect(FeeNormalizer.fromSatsPerVB(1, 'btc/kb')).toBe(0.00001);
      });

      it('should handle edge cases', () => {
        expect(FeeNormalizer.fromSatsPerVB(0, 'sat/vB')).toBe(0);
        expect(FeeNormalizer.fromSatsPerVB(1000, 'sat/vB')).toBe(1000);
      });

      it('should throw error for unsupported units', () => {
        expect(() => FeeNormalizer.fromSatsPerVB(10, 'invalid' as FeeUnit)).toThrow(
          'Unsupported fee unit',
        );
      });
    });

    describe('Round-trip conversion accuracy', () => {
      it('should maintain accuracy for sat/vB round trips', () => {
        const values = [1, 5, 10, 15, 100, 1000];

        values.forEach((value) => {
          const converted = FeeNormalizer.toSatsPerVB(value, 'sat/vB');
          const roundTrip = FeeNormalizer.fromSatsPerVB(converted, 'sat/vB');
          expect(roundTrip).toBe(value);
        });
      });

      it('should maintain reasonable accuracy for btc/kb round trips', () => {
        const btcValues = [0.00001, 0.00005, 0.0001, 0.0005, 0.001];

        btcValues.forEach((value) => {
          const satsPerVB = FeeNormalizer.toSatsPerVB(value, 'btc/kb');
          const roundTrip = FeeNormalizer.fromSatsPerVB(satsPerVB, 'btc/kb');
          expect(Math.abs(roundTrip - value)).toBeLessThan(0.000001); // Small tolerance for floating point
        });
      });
    });
  });

  describe('Virtual size calculation', () => {
    describe('calculateVirtualSize', () => {
      it('should calculate virtual size for a complete transaction', () => {
        // Create a simple transaction for testing
        const tx = new bitcoin.Transaction();

        // Add a test input
        tx.addInput(Buffer.alloc(32), 0);
        tx.ins[0].script = Buffer.alloc(107); // P2PKH script size
        tx.ins[0].sequence = 0xffffffff;

        // Add a test output
        tx.addOutput(Buffer.alloc(25), 100000); // P2PKH output script

        const virtualSize = FeeNormalizer.calculateVirtualSize(tx);

        expect(virtualSize).toBeGreaterThan(0);
        expect(Number.isInteger(virtualSize)).toBe(true);
        expect(virtualSize).toBeGreaterThan(100); // Reasonable minimum for a simple tx
      });

      it('should handle SegWit transactions with witness data', () => {
        const tx = new bitcoin.Transaction();

        // Add input with witness data
        tx.addInput(Buffer.alloc(32), 0);
        tx.ins[0].script = Buffer.alloc(0); // Empty script for P2WPKH
        tx.ins[0].witness = [
          Buffer.alloc(64), // signature
          Buffer.alloc(33), // pubkey
        ];

        // Add output
        tx.addOutput(Buffer.alloc(22), 100000); // P2WPKH output

        const virtualSize = FeeNormalizer.calculateVirtualSize(tx);

        expect(virtualSize).toBeGreaterThan(0);
        expect(Number.isInteger(virtualSize)).toBe(true);
      });

      it('should handle legacy transactions (no witness)', () => {
        const tx = new bitcoin.Transaction();

        // Add legacy input
        tx.addInput(Buffer.alloc(32), 0);
        tx.ins[0].script = Buffer.alloc(107); // P2PKH script
        tx.ins[0].sequence = 0xffffffff;

        // Add legacy output
        tx.addOutput(Buffer.alloc(25), 100000); // P2PKH output

        const virtualSize = FeeNormalizer.calculateVirtualSize(tx);

        expect(virtualSize).toBeGreaterThan(0);
        expect(Number.isInteger(virtualSize)).toBe(true);
      });
    });

    describe('calculateVirtualSizeFromParams', () => {
      it('should calculate virtual size from parameters correctly', () => {
        const inputs = [{ type: 'P2WPKH' as const }];
        const outputs = [{ type: 'P2WPKH' as const }, { type: 'P2WPKH' as const }];

        const calculation = FeeNormalizer.calculateVirtualSizeFromParams(inputs, outputs);

        expect(calculation).toHaveProperty('baseSize');
        expect(calculation).toHaveProperty('totalWeight');
        expect(calculation).toHaveProperty('virtualSize');
        expect(calculation).toHaveProperty('inputSizes');
        expect(calculation).toHaveProperty('outputSizes');
        expect(calculation).toHaveProperty('witnessSizes');

        expect(calculation.virtualSize).toBeGreaterThan(0);
        expect(Number.isInteger(calculation.virtualSize)).toBe(true);
        expect(calculation.inputSizes).toHaveLength(1);
        expect(calculation.outputSizes).toHaveLength(2);
        expect(calculation.witnessSizes).toHaveLength(1);
      });

      it('should handle legacy transactions (no witness)', () => {
        const inputs = [{ type: 'P2PKH' as const }];
        const outputs = [{ type: 'P2PKH' as const }];

        const calculation = FeeNormalizer.calculateVirtualSizeFromParams(inputs, outputs);

        expect(calculation.virtualSize).toBeGreaterThan(0);
        expect(calculation.witnessSizes).toEqual([0]); // No witness data
      });

      it('should handle multiple inputs and outputs', () => {
        const inputs = [
          { type: 'P2WPKH' as const },
          { type: 'P2PKH' as const },
        ];
        const outputs = [
          { type: 'P2WPKH' as const },
          { type: 'P2WSH' as const },
          { type: 'OP_RETURN' as const, size: 80 },
        ];

        const calculation = FeeNormalizer.calculateVirtualSizeFromParams(inputs, outputs);

        expect(calculation.inputSizes).toHaveLength(2); // Two inputs
        expect(calculation.outputSizes).toHaveLength(3); // Three outputs
        expect(calculation.virtualSize).toBeGreaterThan(200); // Reasonable size for complex tx
      });

      it('should handle OP_RETURN outputs with custom script size', () => {
        const inputs = [{ type: 'P2WPKH' as const }];
        const outputs = [{ type: 'OP_RETURN' as const, size: 80 }];

        const calculation = FeeNormalizer.calculateVirtualSizeFromParams(inputs, outputs);

        expect(calculation.virtualSize).toBeGreaterThan(100); // Should include script size
        expect(calculation.outputSizes[0]).toBeGreaterThan(80); // Should include value + script_len
      });

      it('should handle P2WSH with witness script', () => {
        const witnessScript = Buffer.from('witness script data');
        const inputs = [{ type: 'P2WSH' as const, witnessScript }];
        const outputs = [{ type: 'P2WPKH' as const }];

        const calculation = FeeNormalizer.calculateVirtualSizeFromParams(inputs, outputs);

        expect(calculation.virtualSize).toBeGreaterThan(0);
        expect(calculation.witnessSizes[0]).toBeGreaterThan(0); // Should have witness size
      });
    });
  });

  describe('Fee normalization', () => {
    describe('normalizeFeeRate', () => {
      it('should normalize electrum fee rates (sat/kB to sat/vB)', () => {
        // ElectrumX returns sat/kB, should convert to sat/vB
        const normalized = FeeNormalizer.normalizeFeeRate(10000, 'electrum');

        expect(normalized.satsPerVB).toBe(10); // 10000 / 1000 = 10
        expect(normalized.unit).toBe('sat/vB');
        expect(normalized.source).toBe('electrum');
        expect(normalized.confidence).toBeGreaterThan(0);
        expect(normalized.confidence).toBeLessThanOrEqual(1);
        expect(normalized.timestamp).toBeGreaterThan(0);
      });

      it('should normalize electrum fee rate objects', () => {
        const feeRateObj = { fee: 15000 }; // 15 sat/vB

        const normalized = FeeNormalizer.normalizeFeeRate(feeRateObj, 'electrum');

        expect(normalized.satsPerVB).toBe(15);
        expect(normalized.source).toBe('electrum');
      });

      it('should normalize explorer fee rates (direct sat/vB)', () => {
        const normalized = FeeNormalizer.normalizeFeeRate(25, 'explorer');

        expect(normalized.satsPerVB).toBe(25);
        expect(normalized.unit).toBe('sat/vB');
        expect(normalized.source).toBe('explorer');
      });

      it('should normalize explorer fee rate objects', () => {
        const feeRateObj = { satsPerVB: 30 };

        const normalized = FeeNormalizer.normalizeFeeRate(feeRateObj, 'explorer');

        expect(normalized.satsPerVB).toBe(30);
        expect(normalized.source).toBe('explorer');
      });

      it('should normalize mempool fee rates (direct sat/vB)', () => {
        const normalized = FeeNormalizer.normalizeFeeRate(20, 'mempool');

        expect(normalized.satsPerVB).toBe(20);
        expect(normalized.unit).toBe('sat/vB');
        expect(normalized.source).toBe('mempool');
      });

      it('should normalize mempool fee rate objects', () => {
        const feeRateObj = { feeRate: 35 };

        const normalized = FeeNormalizer.normalizeFeeRate(feeRateObj, 'mempool');

        expect(normalized.satsPerVB).toBe(35);
        expect(normalized.source).toBe('mempool');
      });

      it('should handle extreme values gracefully', () => {
        // Very high fee rate
        const high = FeeNormalizer.normalizeFeeRate(2000, 'mempool');
        expect(high.satsPerVB).toBeLessThanOrEqual(1000); // Clamped

        // Very low fee rate
        const low = FeeNormalizer.normalizeFeeRate(0.1, 'mempool');
        expect(low.satsPerVB).toBeGreaterThanOrEqual(1); // Clamped
      });

      it('should throw error for invalid electrum format', () => {
        expect(() => FeeNormalizer.normalizeFeeRate(null, 'electrum')).toThrow(
          'Invalid ElectrumX fee rate format',
        );
        expect(() => FeeNormalizer.normalizeFeeRate({}, 'electrum')).toThrow(
          'Invalid ElectrumX fee rate format',
        );
      });

      it('should throw error for invalid explorer format', () => {
        expect(() => FeeNormalizer.normalizeFeeRate(null, 'explorer')).toThrow(
          'Invalid explorer fee rate format',
        );
        expect(() => FeeNormalizer.normalizeFeeRate({}, 'explorer')).toThrow(
          'Invalid explorer fee rate format',
        );
      });

      it('should throw error for invalid mempool format', () => {
        expect(() => FeeNormalizer.normalizeFeeRate(null, 'mempool')).toThrow(
          'Invalid mempool fee rate format',
        );
        expect(() => FeeNormalizer.normalizeFeeRate({}, 'mempool')).toThrow(
          'Invalid mempool fee rate format',
        );
      });

      it('should throw error for unsupported source', () => {
        expect(() => FeeNormalizer.normalizeFeeRate(10, 'invalid' as FeeSource)).toThrow(
          'Unsupported fee source',
        );
      });
    });
  });

  describe('Standard fee levels', () => {
    describe('getStandardFeeLevel', () => {
      it('should return fee levels for all priorities', () => {
        const priorities: FeePriority[] = ['low', 'medium', 'high', 'urgent'];

        priorities.forEach((priority) => {
          const feeLevel = FeeNormalizer.getStandardFeeLevel(priority);

          expect(feeLevel.satsPerVB).toBeGreaterThan(0);
          expect(feeLevel.unit).toBe('sat/vB');
          expect(feeLevel.source).toBe('explorer'); // BTCStampsExplorer standard
          expect(feeLevel.confidence).toBeGreaterThan(0);
          expect(feeLevel.confidence).toBeLessThanOrEqual(1);
          expect(feeLevel.timestamp).toBeGreaterThan(0);
        });
      });

      it('should return increasing fee rates for higher priorities', () => {
        const low = FeeNormalizer.getStandardFeeLevel('low');
        const medium = FeeNormalizer.getStandardFeeLevel('medium');
        const high = FeeNormalizer.getStandardFeeLevel('high');
        const urgent = FeeNormalizer.getStandardFeeLevel('urgent');

        expect(medium.satsPerVB).toBeGreaterThanOrEqual(low.satsPerVB);
        expect(high.satsPerVB).toBeGreaterThanOrEqual(medium.satsPerVB);
        expect(urgent.satsPerVB).toBeGreaterThanOrEqual(high.satsPerVB);
      });

      it('should return expected standard values', () => {
        const low = FeeNormalizer.getStandardFeeLevel('low');
        const medium = FeeNormalizer.getStandardFeeLevel('medium');
        const high = FeeNormalizer.getStandardFeeLevel('high');
        const urgent = FeeNormalizer.getStandardFeeLevel('urgent');

        expect(low.satsPerVB).toBe(8);
        expect(medium.satsPerVB).toBe(15);
        expect(high.satsPerVB).toBe(25);
        expect(urgent.satsPerVB).toBe(40);
      });
    });

    describe('getAllStandardFeeLevels', () => {
      it('should return all fee levels', () => {
        const allLevels = FeeNormalizer.getAllStandardFeeLevels();

        expect(allLevels).toHaveProperty('low');
        expect(allLevels).toHaveProperty('medium');
        expect(allLevels).toHaveProperty('high');
        expect(allLevels).toHaveProperty('urgent');

        Object.values(allLevels).forEach((level) => {
          expect(level.satsPerVB).toBeGreaterThan(0);
          expect(level.unit).toBe('sat/vB');
          expect(level.source).toBe('explorer');
        });
      });

      it('should return deep copies (immutable)', () => {
        const levels1 = FeeNormalizer.getAllStandardFeeLevels();
        const levels2 = FeeNormalizer.getAllStandardFeeLevels();

        levels1.medium.satsPerVB = 999;
        expect(levels2.medium.satsPerVB).not.toBe(999);
      });
    });

    describe('updateStandardFeeLevels', () => {
      it('should update fee levels', () => {
        const originalLevels = FeeNormalizer.getAllStandardFeeLevels();

        const newMediumLevel: NormalizedFeeRate = {
          satsPerVB: 999,
          unit: 'sat/vB',
          confidence: 0.9,
          source: 'explorer',
          timestamp: Date.now(),
        };

        FeeNormalizer.updateStandardFeeLevels({
          medium: newMediumLevel,
        });

        const updatedMedium = FeeNormalizer.getStandardFeeLevel('medium');
        expect(updatedMedium.satsPerVB).toBe(999);

        // Restore original for other tests
        FeeNormalizer.updateStandardFeeLevels({
          medium: originalLevels.medium,
        });
      });

      it('should update multiple levels at once', () => {
        const original = FeeNormalizer.getAllStandardFeeLevels();

        FeeNormalizer.updateStandardFeeLevels({
          low: { ...original.low, satsPerVB: 100 },
          high: { ...original.high, satsPerVB: 200 },
        });

        expect(FeeNormalizer.getStandardFeeLevel('low').satsPerVB).toBe(100);
        expect(FeeNormalizer.getStandardFeeLevel('high').satsPerVB).toBe(200);
        expect(FeeNormalizer.getStandardFeeLevel('medium').satsPerVB).toBe(
          original.medium.satsPerVB,
        ); // Unchanged

        // Restore
        FeeNormalizer.updateStandardFeeLevels(original);
      });
    });
  });

  describe('Fee calculation utilities', () => {
    describe('calculateFee', () => {
      it('should calculate fee correctly', () => {
        expect(FeeNormalizer.calculateFee(100, 10)).toBe(1000); // 100 vB * 10 sats/vB
        expect(FeeNormalizer.calculateFee(250, 5)).toBe(1250); // 250 vB * 5 sats/vB
        expect(FeeNormalizer.calculateFee(1, 1)).toBe(1); // 1 vB * 1 sats/vB
      });

      it('should handle edge cases', () => {
        expect(FeeNormalizer.calculateFee(0, 10)).toBe(0);
        expect(FeeNormalizer.calculateFee(100, 0)).toBe(0);
        expect(FeeNormalizer.calculateFee(0, 0)).toBe(0);
      });

      it('should handle fractional values correctly (ceiled result)', () => {
        expect(FeeNormalizer.calculateFee(100.5, 10.7)).toBe(1076); // Math.ceil(100.5 * 10.7)
        expect(Number.isInteger(FeeNormalizer.calculateFee(100.5, 10.7))).toBe(true);
      });
    });

    describe('validateFeeRate', () => {
      it('should validate reasonable fee rates', () => {
        expect(FeeNormalizer.validateFeeRate(1)).toBe(true);
        expect(FeeNormalizer.validateFeeRate(10)).toBe(true);
        expect(FeeNormalizer.validateFeeRate(100)).toBe(true);
        expect(FeeNormalizer.validateFeeRate(1000)).toBe(true);
      });

      it('should reject invalid fee rates', () => {
        expect(FeeNormalizer.validateFeeRate(0)).toBe(false);
        expect(FeeNormalizer.validateFeeRate(-1)).toBe(false);
        expect(FeeNormalizer.validateFeeRate(NaN)).toBe(false);
        expect(FeeNormalizer.validateFeeRate(Infinity)).toBe(false);
        expect(FeeNormalizer.validateFeeRate(1001)).toBe(false); // Above max
      });

      it('should handle edge cases', () => {
        expect(FeeNormalizer.validateFeeRate(0.1)).toBe(false); // Below minimum (< 1)
        expect(FeeNormalizer.validateFeeRate(999.9)).toBe(true); // Just under max
        expect(FeeNormalizer.validateFeeRate(1.0)).toBe(true); // At minimum
      });
    });

    describe('normalizeLegacyFee', () => {
      it('should normalize legacy fee calculation', () => {
        const totalFee = 2500; // satoshis
        const transactionSize = 250; // vbytes

        const normalized = FeeNormalizer.normalizeLegacyFee(totalFee, transactionSize, 'vbytes');

        expect(normalized.satsPerVB).toBe(10); // 2500 / 250 = 10
        expect(normalized.confidence).toBe(0.8); // Lower confidence for legacy
        expect(normalized.source).toBe('explorer');
        expect(normalized.timestamp).toBeGreaterThan(0);
      });

      it('should handle legacy byte calculation', () => {
        const totalFee = 1000;
        const transactionSize = 100;

        const normalized = FeeNormalizer.normalizeLegacyFee(totalFee, transactionSize, 'bytes');

        expect(normalized.satsPerVB).toBe(10); // 1000 / 100 = 10 (ceiled)
      });

      it('should handle fractional results', () => {
        const totalFee = 999;
        const transactionSize = 100;

        const normalized = FeeNormalizer.normalizeLegacyFee(totalFee, transactionSize);

        expect(normalized.satsPerVB).toBe(10); // Math.ceil(9.99) = 10
      });
    });
  });

  describe('Helper functions', () => {
    describe('createNormalizedFeeRate', () => {
      it('should create normalized fee rate from raw values', () => {
        const normalized = createNormalizedFeeRate(0.00002, 'btc/kb', 'explorer');

        expect(normalized.satsPerVB).toBe(2); // 0.00002 BTC/kB = 2000 sats/kB = 2 sats/vB (rounded)
        expect(normalized.unit).toBe('sat/vB');
        expect(normalized.source).toBe('explorer');
        expect(normalized.confidence).toBeGreaterThan(0);
      });

      it('should handle different units', () => {
        const satVB = createNormalizedFeeRate(15, 'sat/vB', 'mempool');
        const satByte = createNormalizedFeeRate(15, 'sat/byte', 'mempool');

        expect(satVB.satsPerVB).toBe(15);
        expect(satByte.satsPerVB).toBe(15);
      });
    });

    describe('calculateNormalizedFee', () => {
      it('should calculate normalized fee for transaction', () => {
        const inputs = [{ type: 'P2WPKH' as const }];
        const outputs = [{ type: 'P2WPKH' as const }];
        const feeRate: NormalizedFeeRate = {
          satsPerVB: 10,
          unit: 'sat/vB',
          confidence: 0.9,
          source: 'mempool',
          timestamp: Date.now(),
        };

        const result = calculateNormalizedFee(inputs, outputs, feeRate);

        expect(result).toHaveProperty('virtualSize');
        expect(result).toHaveProperty('totalFee');
        expect(result).toHaveProperty('feePerVB');
        expect(result).toHaveProperty('calculation');

        expect(result.virtualSize).toBeGreaterThan(0);
        expect(result.totalFee).toBe(result.virtualSize * feeRate.satsPerVB);
        expect(result.feePerVB).toBe(feeRate.satsPerVB);
      });

      it('should handle complex transactions', () => {
        const inputs = [
          { type: 'P2WPKH' as const },
          { type: 'P2PKH' as const },
        ];
        const outputs = [
          { type: 'P2WPKH' as const },
          { type: 'OP_RETURN' as const, size: 40 },
        ];
        const feeRate: NormalizedFeeRate = {
          satsPerVB: 15,
          unit: 'sat/vB',
          confidence: 0.85,
          source: 'explorer',
          timestamp: Date.now(),
        };

        const result = calculateNormalizedFee(inputs, outputs, feeRate);

        expect(result.virtualSize).toBeGreaterThan(150); // Complex tx
        expect(result.totalFee).toBeGreaterThan(2000); // Should be substantial
        expect(result.calculation.inputSizes).toHaveLength(2);
        expect(result.calculation.outputSizes).toHaveLength(2);
      });
    });

    describe('getFeeLevelsEstimate', () => {
      it('should return estimates for all priority levels', () => {
        const inputs = [{ type: 'P2WPKH' as const }];
        const outputs = [{ type: 'P2WPKH' as const }];

        const result = getFeeLevelsEstimate(inputs, outputs);

        expect(result).toHaveProperty('virtualSize');
        expect(result).toHaveProperty('estimates');

        expect(result.estimates).toHaveProperty('low');
        expect(result.estimates).toHaveProperty('medium');
        expect(result.estimates).toHaveProperty('high');
        expect(result.estimates).toHaveProperty('urgent');

        const { low, medium, high, urgent } = result.estimates;

        expect(low.totalFee).toBeLessThan(medium.totalFee);
        expect(medium.totalFee).toBeLessThan(high.totalFee);
        expect(high.totalFee).toBeLessThan(urgent.totalFee);

        // All should use same virtual size
        expect(low.totalFee / low.feeRate.satsPerVB).toBe(result.virtualSize);
        expect(medium.totalFee / medium.feeRate.satsPerVB).toBe(result.virtualSize);
      });
    });

    describe('validateAndNormalizeFee', () => {
      it('should validate and normalize valid fees', () => {
        const validFee = validateAndNormalizeFee(15, 'mempool');

        expect(validFee).not.toBeNull();
        expect(validFee!.satsPerVB).toBe(15);
        expect(validFee!.source).toBe('mempool');
      });

      it('should reject fees outside bounds', () => {
        const tooLow = validateAndNormalizeFee(0.5, 'mempool', 1, 1000);
        const tooHigh = validateAndNormalizeFee(1500, 'mempool', 1, 1000);

        expect(tooLow).toBeNull();
        expect(tooHigh).toBeNull();
      });

      it('should handle custom bounds', () => {
        const valid = validateAndNormalizeFee(50, 'mempool', 10, 100);
        const invalid = validateAndNormalizeFee(150, 'mempool', 10, 100);

        expect(valid).not.toBeNull();
        expect(invalid).toBeNull();
      });

      it('should handle electrum format correctly', () => {
        // ElectrumX returns sat/kB, so 20000 sat/kB = 20 sat/vB
        const valid = validateAndNormalizeFee(20000, 'electrum', 1, 100);

        expect(valid).not.toBeNull();
        expect(valid!.satsPerVB).toBe(20);
      });

      it('should handle invalid format gracefully', () => {
        const invalid = validateAndNormalizeFee(null, 'mempool');

        expect(invalid).toBeNull();
      });
    });
  });

  describe('Performance and edge cases', () => {
    it('should handle many conversions efficiently', () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        FeeNormalizer.toSatsPerVB(i % 100 + 1, 'sat/vB');
        FeeNormalizer.fromSatsPerVB(i % 50 + 1, 'btc/kb');
        FeeNormalizer.calculateFee(i % 200 + 100, i % 20 + 1);
      }

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should maintain precision for small values', () => {
      const smallBtcValue = 0.00000001; // 1 sat/kB
      const converted = FeeNormalizer.toSatsPerVB(smallBtcValue, 'btc/kb');
      expect(converted).toBeGreaterThanOrEqual(0);
    });

    it('should handle large values', () => {
      const largeSatsPerVB = 1000000; // Very high fee rate
      expect(() => FeeNormalizer.fromSatsPerVB(largeSatsPerVB, 'btc/kb')).not.toThrow();
      expect(() => FeeNormalizer.calculateFee(1000, largeSatsPerVB)).not.toThrow();
    });

    it('should maintain consistency across multiple calls', () => {
      const testValue = 25;
      const result1 = FeeNormalizer.toSatsPerVB(testValue, 'sat/vB');
      const result2 = FeeNormalizer.toSatsPerVB(testValue, 'sat/vB');
      const result3 = FeeNormalizer.toSatsPerVB(testValue, 'sat/vB');

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('should handle confidence calculation edge cases', () => {
      // Test very high fee rates
      const highFee = FeeNormalizer.normalizeFeeRate(1000, 'mempool');
      expect(highFee.confidence).toBeLessThan(1.0); // Should be reduced

      // Test very low fee rates
      const lowFee = FeeNormalizer.normalizeFeeRate(0.5, 'mempool');
      expect(lowFee.confidence).toBeLessThan(1.0); // Should be reduced

      // Test normal range
      const normalFee = FeeNormalizer.normalizeFeeRate(20, 'mempool');
      expect(normalFee.confidence).toBeGreaterThan(0.8); // Should be higher
    });
  });
});
