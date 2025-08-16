/**
 * Dust Calculator Tests
 *
 * Tests for dynamic dust threshold calculation based on Bitcoin Core's logic.
 * Validates correct dust thresholds for different output types and network conditions.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  createDustCalculator,
  DustCalculator,
  type DustCalculatorOptions,
} from '../../../src/utils/dust-calculator';
import type { OutputType } from '../../../src/interfaces/fee.interface';

describe('DustCalculator', () => {
  let calculator: DustCalculator;

  beforeEach(() => {
    calculator = new DustCalculator();
  });

  describe('Constructor and initialization', () => {
    it('should create with default options', () => {
      const calc = new DustCalculator();
      expect(calc).toBeInstanceOf(DustCalculator);
      expect(calc.getNetworkMinRelayFeeRate()).toBe(1); // mainnet default
    });

    it('should create with custom options', () => {
      const options: DustCalculatorOptions = {
        minRelayFeeRate: 5,
        networkType: 'testnet',
        enableSrc20Rules: false,
      };

      const calc = new DustCalculator(options);
      expect(calc.getNetworkMinRelayFeeRate()).toBe(1); // testnet rate
    });

    it('should handle regtest network', () => {
      const calc = new DustCalculator({ networkType: 'regtest' });
      expect(calc.getNetworkMinRelayFeeRate()).toBe(0); // regtest rate
    });

    it('should preserve SRC20 options', () => {
      const src20Options = { dustValue: 330 };
      const calc = new DustCalculator({
        enableSrc20Rules: true,
        src20Options,
      });
      expect(calc).toBeInstanceOf(DustCalculator);
    });
  });

  describe('calculateDustThreshold', () => {
    describe('P2WPKH outputs', () => {
      it('should calculate correct P2WPKH dust threshold at 1 sat/vB', () => {
        const threshold = calculator.calculateDustThreshold('P2WPKH', undefined, 1);
        expect(threshold).toBe(294); // Known Bitcoin Core value
      });

      it('should calculate P2WPKH threshold with custom fee rate', () => {
        const threshold = calculator.calculateDustThreshold('P2WPKH', undefined, 10);
        // (68 + 31) * 10 = 990, but network minimum is 294
        expect(threshold).toBe(990);
      });

      it('should respect network minimum for low fee rates', () => {
        const threshold = calculator.calculateDustThreshold('P2WPKH', undefined, 0.1);
        expect(threshold).toBe(294); // Network minimum
      });
    });

    describe('P2PKH outputs', () => {
      it('should calculate correct P2PKH dust threshold at 1 sat/vB', () => {
        const threshold = calculator.calculateDustThreshold('P2PKH', undefined, 1);
        expect(threshold).toBe(546); // Known Bitcoin Core value
      });

      it('should calculate P2PKH threshold with high fee rate', () => {
        const threshold = calculator.calculateDustThreshold('P2PKH', undefined, 20);
        // (148 + 34) * 20 = 3640
        expect(threshold).toBe(3640);
      });
    });

    describe('P2WSH outputs', () => {
      it('should calculate correct P2WSH dust threshold at 1 sat/vB', () => {
        const threshold = calculator.calculateDustThreshold('P2WSH', undefined, 1);
        expect(threshold).toBe(330); // Known Bitcoin Core value
      });

      it('should handle P2WSH with variable fee rates', () => {
        const threshold5 = calculator.calculateDustThreshold('P2WSH', undefined, 5);
        const threshold10 = calculator.calculateDustThreshold('P2WSH', undefined, 10);

        expect(threshold10).toBeGreaterThan(threshold5);
        expect(threshold5).toBeGreaterThan(330); // Above network minimum
      });
    });

    describe('P2SH outputs', () => {
      it('should calculate correct P2SH dust threshold', () => {
        const threshold = calculator.calculateDustThreshold('P2SH', undefined, 1);
        expect(threshold).toBe(540); // Known Bitcoin Core value
      });
    });

    describe('P2TR outputs', () => {
      it('should calculate correct P2TR dust threshold', () => {
        const threshold = calculator.calculateDustThreshold('P2TR', undefined, 1);
        expect(threshold).toBe(330); // Known Bitcoin Core value
      });
    });

    describe('OP_RETURN outputs', () => {
      it('should calculate OP_RETURN dust with custom script size', () => {
        const scriptSize = 80; // 80-byte OP_RETURN
        const threshold = calculator.calculateDustThreshold('OP_RETURN', scriptSize, 1);

        // OP_RETURN outputs can't be spent, so no input size
        // (0 + 8 + 1 + 80) * 1 = 89
        expect(threshold).toBe(89);
      });

      it('should handle zero-size OP_RETURN', () => {
        const threshold = calculator.calculateDustThreshold('OP_RETURN', 0, 1);
        expect(threshold).toBe(9); // 8 + 1 + 0 = 9
      });

      it('should scale OP_RETURN with fee rate', () => {
        const threshold1 = calculator.calculateDustThreshold('OP_RETURN', 50, 1);
        const threshold10 = calculator.calculateDustThreshold('OP_RETURN', 50, 10);

        expect(threshold10).toBe(threshold1 * 10);
      });
    });

    describe('Edge cases', () => {
      it('should handle zero fee rate', () => {
        const threshold = calculator.calculateDustThreshold('P2WPKH', undefined, 0);
        expect(threshold).toBe(294); // Network minimum
      });

      it('should handle negative fee rate', () => {
        const threshold = calculator.calculateDustThreshold('P2WPKH', undefined, -5);
        expect(threshold).toBe(294); // Network minimum
      });

      it('should handle very high fee rates', () => {
        const threshold = calculator.calculateDustThreshold('P2WPKH', undefined, 1000);
        expect(threshold).toBeGreaterThan(90000); // Very high threshold
      });

      it('should use default fee rate when not provided', () => {
        const threshold = calculator.calculateDustThreshold('P2WPKH');
        const thresholdExplicit = calculator.calculateDustThreshold('P2WPKH', undefined, 1);
        expect(threshold).toBe(thresholdExplicit);
      });
    });
  });

  describe('calculateAllThresholds', () => {
    it('should calculate all standard output types', () => {
      const thresholds = calculator.calculateAllThresholds(1);

      expect(thresholds).toHaveProperty('P2PKH');
      expect(thresholds).toHaveProperty('P2WPKH');
      expect(thresholds).toHaveProperty('P2SH');
      expect(thresholds).toHaveProperty('P2WSH');
      expect(thresholds).toHaveProperty('P2TR');

      // Verify known values at 1 sat/vB
      expect(thresholds.P2PKH).toBe(546);
      expect(thresholds.P2WPKH).toBe(294);
      expect(thresholds.P2SH).toBe(540);
      expect(thresholds.P2WSH).toBe(330);
      expect(thresholds.P2TR).toBe(330);
    });

    it('should scale all thresholds with fee rate', () => {
      const thresholds1 = calculator.calculateAllThresholds(1);
      const thresholds10 = calculator.calculateAllThresholds(10);

      // All thresholds should increase (except where network minimums apply)
      expect(thresholds10.P2PKH).toBeGreaterThan(thresholds1.P2PKH);
      expect(thresholds10.P2WPKH).toBeGreaterThan(thresholds1.P2WPKH);
      expect(thresholds10.P2SH).toBeGreaterThan(thresholds1.P2SH);
      expect(thresholds10.P2WSH).toBeGreaterThan(thresholds1.P2WSH);
      expect(thresholds10.P2TR).toBeGreaterThan(thresholds1.P2TR);
    });

    it('should use default fee rate when not provided', () => {
      const thresholds = calculator.calculateAllThresholds();
      const thresholdsExplicit = calculator.calculateAllThresholds(1);

      expect(thresholds).toEqual(thresholdsExplicit);
    });
  });

  describe('isAboveDustThreshold', () => {
    it('should return true for values above dust threshold', () => {
      expect(calculator.isAboveDustThreshold(300, 'P2WPKH')).toBe(true);
      expect(calculator.isAboveDustThreshold(546, 'P2PKH')).toBe(true);
      expect(calculator.isAboveDustThreshold(1000, 'P2WSH')).toBe(true);
    });

    it('should return false for values below dust threshold', () => {
      expect(calculator.isAboveDustThreshold(293, 'P2WPKH')).toBe(false);
      expect(calculator.isAboveDustThreshold(545, 'P2PKH')).toBe(false);
      expect(calculator.isAboveDustThreshold(329, 'P2WSH')).toBe(false);
    });

    it('should return true for values exactly at dust threshold', () => {
      expect(calculator.isAboveDustThreshold(294, 'P2WPKH')).toBe(true);
      expect(calculator.isAboveDustThreshold(546, 'P2PKH')).toBe(true);
      expect(calculator.isAboveDustThreshold(330, 'P2WSH')).toBe(true);
    });

    it('should handle custom fee rates', () => {
      const highFeeRate = 50;
      const threshold = calculator.calculateDustThreshold('P2WPKH', undefined, highFeeRate);

      expect(calculator.isAboveDustThreshold(threshold - 1, 'P2WPKH', undefined, highFeeRate)).toBe(
        false,
      );
      expect(calculator.isAboveDustThreshold(threshold, 'P2WPKH', undefined, highFeeRate)).toBe(
        true,
      );
      expect(calculator.isAboveDustThreshold(threshold + 1, 'P2WPKH', undefined, highFeeRate)).toBe(
        true,
      );
    });

    it('should handle OP_RETURN with custom script size', () => {
      const scriptSize = 40;
      const value = 50;

      const result = calculator.isAboveDustThreshold(value, 'OP_RETURN', scriptSize, 1);
      const threshold = calculator.calculateDustThreshold('OP_RETURN', scriptSize, 1);

      expect(result).toBe(value >= threshold);
    });
  });

  describe('calculateCustomScriptDust', () => {
    it('should calculate dust for custom script hex', () => {
      const scriptHex = '6a4c50'; // OP_RETURN with 80-byte payload prefix
      const dust = calculator.calculateCustomScriptDust(scriptHex, 1);

      expect(dust).toBeGreaterThan(0);
      expect(typeof dust).toBe('number');
    });

    it('should handle empty script', () => {
      const dust = calculator.calculateCustomScriptDust('', 1);
      expect(dust).toBe(9); // 8 + 1 + 0 = 9
    });

    it('should handle long scripts', () => {
      const longScript = '6a4c50' + 'ff'.repeat(80); // Long OP_RETURN
      const dust = calculator.calculateCustomScriptDust(longScript, 1);

      expect(dust).toBeGreaterThan(80); // Should account for script length
    });

    it('should scale with fee rate', () => {
      const scriptHex = '6a20' + 'aa'.repeat(32); // 32-byte OP_RETURN
      const dust1 = calculator.calculateCustomScriptDust(scriptHex, 1);
      const dust10 = calculator.calculateCustomScriptDust(scriptHex, 10);

      expect(dust10).toBe(dust1 * 10);
    });
  });

  describe('getNetworkMinRelayFeeRate', () => {
    it('should return correct rate for mainnet', () => {
      const calc = new DustCalculator({ networkType: 'mainnet' });
      expect(calc.getNetworkMinRelayFeeRate()).toBe(1);
    });

    it('should return correct rate for testnet', () => {
      const calc = new DustCalculator({ networkType: 'testnet' });
      expect(calc.getNetworkMinRelayFeeRate()).toBe(1);
    });

    it('should return correct rate for regtest', () => {
      const calc = new DustCalculator({ networkType: 'regtest' });
      expect(calc.getNetworkMinRelayFeeRate()).toBe(0);
    });
  });

  describe('validateAgainstReference', () => {
    it('should validate against Bitcoin Core reference values', () => {
      const validation = calculator.validateAgainstReference();

      expect(validation).toHaveProperty('isValid');
      expect(validation).toHaveProperty('differences');
      expect(Array.isArray(validation.differences)).toBe(true);
      expect(validation.differences).toHaveLength(5); // All output types
    });

    it('should pass validation for default mainnet calculator', () => {
      const calc = new DustCalculator({ networkType: 'mainnet' });
      const validation = calc.validateAgainstReference();

      expect(validation.isValid).toBe(true);
    });

    it('should provide detailed differences', () => {
      const validation = calculator.validateAgainstReference();

      validation.differences.forEach((diff) => {
        expect(diff).toHaveProperty('outputType');
        expect(diff).toHaveProperty('calculated');
        expect(diff).toHaveProperty('expected');
        expect(diff).toHaveProperty('diff');
        expect(typeof diff.calculated).toBe('number');
        expect(typeof diff.expected).toBe('number');
        expect(diff.diff).toBeGreaterThanOrEqual(0);
      });
    });

    it('should match expected reference values exactly', () => {
      const validation = calculator.validateAgainstReference();
      const expectedValues = {
        P2PKH: 546,
        P2WPKH: 294,
        P2SH: 540,
        P2WSH: 330,
        P2TR: 330,
      };

      validation.differences.forEach((diff) => {
        const expected = expectedValues[diff.outputType as keyof typeof expectedValues];
        expect(diff.expected).toBe(expected);
        expect(diff.calculated).toBe(expected); // Should match exactly
      });
    });
  });

  describe('Network-specific behavior', () => {
    describe('Mainnet', () => {
      let mainnetCalc: DustCalculator;

      beforeEach(() => {
        mainnetCalc = new DustCalculator({ networkType: 'mainnet' });
      });

      it('should enforce mainnet minimums', () => {
        const thresholds = mainnetCalc.calculateAllThresholds(0.1);

        expect(thresholds.P2PKH).toBe(546);
        expect(thresholds.P2WPKH).toBe(294);
        expect(thresholds.P2SH).toBe(540);
        expect(thresholds.P2WSH).toBe(330);
        expect(thresholds.P2TR).toBe(330);
      });
    });

    describe('Testnet', () => {
      let testnetCalc: DustCalculator;

      beforeEach(() => {
        testnetCalc = new DustCalculator({ networkType: 'testnet' });
      });

      it('should use same minimums as mainnet', () => {
        const testnetThresholds = testnetCalc.calculateAllThresholds(1);
        const mainnetThresholds = calculator.calculateAllThresholds(1);

        expect(testnetThresholds).toEqual(mainnetThresholds);
      });
    });

    describe('Regtest', () => {
      let regtestCalc: DustCalculator;

      beforeEach(() => {
        regtestCalc = new DustCalculator({ networkType: 'regtest' });
      });

      it('should have no network minimums', () => {
        const thresholds = regtestCalc.calculateAllThresholds(0.01);

        // All values should be very low (just the calculation, no minimums)
        expect(thresholds.P2PKH).toBeLessThan(10);
        expect(thresholds.P2WPKH).toBeLessThan(10);
        expect(thresholds.P2SH).toBeLessThan(10);
        expect(thresholds.P2WSH).toBeLessThan(10);
        expect(thresholds.P2TR).toBeLessThan(10);
      });

      it('should allow zero dust on regtest', () => {
        const threshold = regtestCalc.calculateDustThreshold('P2WPKH', undefined, 0);
        expect(threshold).toBe(0);
      });
    });
  });

  describe('createDustCalculator helper function', () => {
    it('should create calculator with default parameters', () => {
      const calc = createDustCalculator();
      expect(calc).toBeInstanceOf(DustCalculator);
      expect(calc.getNetworkMinRelayFeeRate()).toBe(1); // mainnet
    });

    it('should create calculator with custom network', () => {
      const calc = createDustCalculator('testnet');
      expect(calc.getNetworkMinRelayFeeRate()).toBe(1); // testnet
    });

    it('should create calculator with SRC20 rules disabled', () => {
      const calc = createDustCalculator('mainnet', false);
      expect(calc).toBeInstanceOf(DustCalculator);
    });

    it('should create calculator with SRC20 options', () => {
      const src20Options = { dustValue: 330 };
      const calc = createDustCalculator('mainnet', true, src20Options);
      expect(calc).toBeInstanceOf(DustCalculator);
    });

    it('should use correct relay fee rate for network', () => {
      const mainnetCalc = createDustCalculator('mainnet');
      const testnetCalc = createDustCalculator('testnet');
      const regtestCalc = createDustCalculator('regtest');

      expect(mainnetCalc.getNetworkMinRelayFeeRate()).toBe(1);
      expect(testnetCalc.getNetworkMinRelayFeeRate()).toBe(1);
      expect(regtestCalc.getNetworkMinRelayFeeRate()).toBe(0);
    });
  });

  describe('Performance and edge cases', () => {
    it('should handle many calculations efficiently', () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        calculator.calculateDustThreshold('P2WPKH', undefined, i % 100 + 1);
        calculator.isAboveDustThreshold(1000, 'P2PKH', undefined, i % 50 + 1);
      }

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle floating point fee rates', () => {
      const threshold = calculator.calculateDustThreshold('P2WPKH', undefined, 5.7);
      expect(threshold).toBeGreaterThan(294);
      expect(Number.isInteger(threshold)).toBe(true); // Should be ceiled to integer
    });

    it('should handle very small fee rates', () => {
      const threshold = calculator.calculateDustThreshold('P2WPKH', undefined, 0.001);
      expect(threshold).toBe(294); // Network minimum
    });

    it('should maintain consistency across multiple calls', () => {
      const threshold1 = calculator.calculateDustThreshold('P2WPKH', undefined, 10);
      const threshold2 = calculator.calculateDustThreshold('P2WPKH', undefined, 10);
      const threshold3 = calculator.calculateDustThreshold('P2WPKH', undefined, 10);

      expect(threshold1).toBe(threshold2);
      expect(threshold2).toBe(threshold3);
    });
  });
});
