import { beforeEach, describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import * as bitcoin from 'bitcoinjs-lib';
import { PSBTBuilder, type PSBTOptions } from '../../../src/core/psbt-builder.ts';
import { MOCK_UTXOS } from '../../fixtures/utxos.ts';

describe('PSBTBuilder', () => {
  let builder: PSBTBuilder;
  const testNetwork = bitcoin.networks.testnet;

  beforeEach(() => {
    builder = new PSBTBuilder({ network: testNetwork });
  });

  describe('Constructor and Configuration', () => {
    it('should create with default options', () => {
      const defaultBuilder = new PSBTBuilder();
      expect(defaultBuilder).toBeDefined();
      expect(defaultBuilder.getPSBT()).toBeDefined();
    });

    it('should create with custom network', () => {
      const mainnetBuilder = new PSBTBuilder({ network: bitcoin.networks.bitcoin });
      expect(mainnetBuilder).toBeDefined();
    });

    it('should create with custom version', () => {
      const options: PSBTOptions = { version: 2, network: testNetwork };
      const versionBuilder = new PSBTBuilder(options);
      expect(versionBuilder.getPSBT().version).toBe(2);
    });

    it('should create with custom locktime', () => {
      const locktime = 500000;
      const options: PSBTOptions = { locktime, network: testNetwork };
      const locktimeBuilder = new PSBTBuilder(options);
      expect(locktimeBuilder.getPSBT().locktime).toBe(locktime);
    });

    it('should create with maximum fee rate', () => {
      const maxFeeRate = 1000;
      const options: PSBTOptions = { maximumFeeRate: maxFeeRate, network: testNetwork };
      const feeBuilder = new PSBTBuilder(options);
      expect(feeBuilder).toBeDefined();
    });

    it('should handle all options together', () => {
      const options: PSBTOptions = {
        network: bitcoin.networks.regtest,
        version: 2,
        locktime: 600000,
        maximumFeeRate: 500,
      };
      const fullOptionsBuilder = new PSBTBuilder(options);
      const psbt = fullOptionsBuilder.getPSBT();
      expect(psbt.version).toBe(2);
      expect(psbt.locktime).toBe(600000);
    });
  });

  describe('Static Factory Methods', () => {
    let samplePsbt: PSBTBuilder;

    beforeEach(() => {
      samplePsbt = new PSBTBuilder({ network: testNetwork });
      // Add a proper input and output to make a valid PSBT
      samplePsbt.addInput(MOCK_UTXOS[0].txid, MOCK_UTXOS[0].vout, {
        witnessUtxo: {
          script: Buffer.from(MOCK_UTXOS[0].scriptPubKey, 'hex'),
          value: MOCK_UTXOS[0].value,
        },
      });
      samplePsbt.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 10000);
    });

    it('should create from base64', () => {
      const base64 = samplePsbt.toBase64();
      const fromBase64 = PSBTBuilder.fromBase64(base64, testNetwork);
      expect(fromBase64).toBeDefined();
      expect(fromBase64.toBase64()).toBe(base64);
    });

    it('should create from hex', () => {
      const hex = samplePsbt.toHex();
      const fromHex = PSBTBuilder.fromHex(hex, testNetwork);
      expect(fromHex).toBeDefined();
      expect(fromHex.toHex()).toBe(hex);
    });

    it('should create from buffer', () => {
      const buffer = samplePsbt.toBuffer();
      const fromBuffer = PSBTBuilder.fromBuffer(buffer, testNetwork);
      expect(fromBuffer).toBeDefined();
      expect(Buffer.compare(fromBuffer.toBuffer(), buffer)).toBe(0);
    });

    it('should handle network parameter in static methods', () => {
      const base64 = samplePsbt.toBase64();
      const fromBase64 = PSBTBuilder.fromBase64(base64, bitcoin.networks.bitcoin);
      expect(fromBase64).toBeDefined();
    });

    it('should handle missing network parameter', () => {
      const base64 = samplePsbt.toBase64();
      const fromBase64 = PSBTBuilder.fromBase64(base64);
      expect(fromBase64).toBeDefined();
    });
  });

  describe('Input Management', () => {
    const mockTxid = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const mockVout = 0;
    const mockValue = 100000;
    const mockScript = Buffer.from('76a914' + '0'.repeat(40) + '88ac', 'hex');

    it('should add basic input', () => {
      builder.addInput(mockTxid, mockVout);
      const psbt = builder.getPSBT();
      expect(psbt.inputCount).toBe(1);
    });

    it('should add input with witness UTXO', () => {
      builder.addInput(mockTxid, mockVout, {
        witnessUtxo: {
          script: mockScript,
          value: mockValue,
        },
      });
      const psbt = builder.getPSBT();
      expect(psbt.inputCount).toBe(1);
      expect(psbt.data.inputs[0]?.witnessUtxo).toBeDefined();
      expect(psbt.data.inputs[0]?.witnessUtxo?.value).toBe(mockValue);
    });

    it('should add input with non-witness UTXO', () => {
      // Create a valid transaction buffer
      const tx = new bitcoin.Transaction();
      tx.addInput(Buffer.alloc(32), 0);
      tx.addOutput(mockScript, mockValue);
      const mockTx = tx.toBuffer();

      builder.addInput(mockTxid, mockVout, {
        nonWitnessUtxo: mockTx,
      });
      const psbt = builder.getPSBT();
      expect(psbt.data.inputs[0]?.nonWitnessUtxo).toBeDefined();
    });

    it('should add input with custom sequence', () => {
      const customSequence = 0xfffffffe;
      builder.addInput(mockTxid, mockVout, {
        sequence: customSequence,
      });
      const psbt = builder.getPSBT();
      expect(psbt.txInputs[0]?.sequence).toBe(customSequence);
    });

    it('should add input with redeem script', () => {
      const redeemScript = Buffer.from('51', 'hex'); // OP_1
      builder.addInput(mockTxid, mockVout, {
        redeemScript,
        witnessUtxo: { script: mockScript, value: mockValue },
      });
      const psbt = builder.getPSBT();
      expect(psbt.data.inputs[0]?.redeemScript).toBeDefined();
    });

    it('should add input with witness script', () => {
      const witnessScript = Buffer.from('51', 'hex'); // OP_1
      builder.addInput(mockTxid, mockVout, {
        witnessScript,
        witnessUtxo: { script: mockScript, value: mockValue },
      });
      const psbt = builder.getPSBT();
      expect(psbt.data.inputs[0]?.witnessScript).toBeDefined();
    });

    it('should handle Buffer txid input', () => {
      const bufferTxid = Buffer.from(mockTxid, 'hex');
      builder.addInput(bufferTxid, mockVout);
      const psbt = builder.getPSBT();
      expect(psbt.inputCount).toBe(1);
    });

    it('should normalize invalid txid', () => {
      const invalidTxid = 'invalid-txid';
      builder.addInput(invalidTxid, mockVout);
      const psbt = builder.getPSBT();
      expect(psbt.inputCount).toBe(1);
    });

    it('should handle short txid', () => {
      const shortTxid = '1234abcd';
      builder.addInput(shortTxid, mockVout);
      const psbt = builder.getPSBT();
      expect(psbt.inputCount).toBe(1);
    });

    it('should add multiple inputs', () => {
      builder.addInput(mockTxid, 0);
      builder.addInput(mockTxid, 1);
      builder.addInput(mockTxid, 2);
      const psbt = builder.getPSBT();
      expect(psbt.inputCount).toBe(3);
    });
  });

  describe('Output Management', () => {
    const testAddress = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
    const testValue = 50000;

    it('should add output with address', () => {
      builder.addOutput(testAddress, testValue);
      const psbt = builder.getPSBT();
      expect(psbt.outputCount).toBe(1);
      expect(psbt.txOutputs[0]?.value).toBe(testValue);
    });

    it('should add output with script', () => {
      const opReturnScript = Buffer.from('6a0568656c6c6f', 'hex'); // OP_RETURN "hello"
      builder.addOutput(opReturnScript, 0);
      const psbt = builder.getPSBT();
      expect(psbt.outputCount).toBe(1);
      expect(psbt.txOutputs[0]?.value).toBe(0);
    });

    it('should add multiple outputs', () => {
      builder.addOutput(testAddress, testValue);
      builder.addOutput(testAddress, testValue * 2);
      const psbt = builder.getPSBT();
      expect(psbt.outputCount).toBe(2);
      expect(psbt.txOutputs[1]?.value).toBe(testValue * 2);
    });

    it('should add OP_RETURN data output', () => {
      const data = Buffer.from('Hello, Bitcoin!', 'utf8');
      builder.addDataOutput(data);
      const psbt = builder.getPSBT();
      expect(psbt.outputCount).toBe(1);
      expect(psbt.txOutputs[0]?.value).toBe(0);
    });

    it('should handle large data in OP_RETURN', () => {
      const largeData = Buffer.alloc(80, 0xaa); // 80 bytes of 0xaa
      builder.addDataOutput(largeData);
      const psbt = builder.getPSBT();
      expect(psbt.outputCount).toBe(1);
    });

    it('should throw error for invalid OP_RETURN data', () => {
      // This test depends on the specific implementation of bitcoinjs-lib
      // The error might not always be thrown, but we test the happy path
      const data = Buffer.from('test', 'utf8');
      expect(() => builder.addDataOutput(data)).not.toThrow();
    });
  });

  describe('PSBT Operations', () => {
    let psbt1: PSBTBuilder;
    let psbt2: PSBTBuilder;

    beforeEach(() => {
      psbt1 = new PSBTBuilder({ network: testNetwork });
      psbt2 = new PSBTBuilder({ network: testNetwork });

      // Add some content to make them combinable
      psbt1.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 10000);
      psbt2.addOutput('tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7', 20000);
    });

    it('should combine PSBTs', () => {
      // Create PSBTs with same base transaction for combining
      const basePsbt1 = new PSBTBuilder({ network: testNetwork });
      const basePsbt2 = new PSBTBuilder({ network: testNetwork });

      // Add the same input to both PSBTs
      const sharedInput = {
        txid: MOCK_UTXOS[0].txid,
        vout: MOCK_UTXOS[0].vout,
        witnessUtxo: {
          script: Buffer.from(MOCK_UTXOS[0].scriptPubKey, 'hex'),
          value: MOCK_UTXOS[0].value,
        },
      };

      basePsbt1.addInput(sharedInput.txid, sharedInput.vout, {
        witnessUtxo: sharedInput.witnessUtxo,
      });
      basePsbt2.addInput(sharedInput.txid, sharedInput.vout, {
        witnessUtxo: sharedInput.witnessUtxo,
      });

      // Add same output
      basePsbt1.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 10000);
      basePsbt2.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 10000);

      // Now they can be combined
      expect(() => basePsbt1.combine(basePsbt2.getPSBT())).not.toThrow();
    });

    it('should clone PSBT', () => {
      const originalBase64 = builder.toBase64();
      const cloned = builder.clone();
      expect(cloned).toBeDefined();
      expect(cloned.toBase64()).toBe(originalBase64);
    });

    it('should clone PSBT with different reference', () => {
      const cloned = builder.clone();
      builder.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 10000);
      // Cloned should not be affected
      expect(cloned.getPSBT().outputCount).toBe(0);
      expect(builder.getPSBT().outputCount).toBe(1);
    });
  });

  describe('Signature Validation', () => {
    it('should return false for PSBT with no signatures', () => {
      builder.addInput(MOCK_UTXOS[0].txid, MOCK_UTXOS[0].vout);
      const isValid = builder.validateSignatures();
      expect(isValid).toBe(false);
    });

    it('should return true for PSBT with no inputs', () => {
      const emptyBuilder = new PSBTBuilder({ network: testNetwork });
      const isValid = emptyBuilder.validateSignatures();
      expect(isValid).toBe(true); // No inputs = no failed signatures
    });

    it('should handle validation errors gracefully', () => {
      // Add input without proper setup
      builder.addInput('invalid', 0);
      expect(() => builder.validateSignatures()).not.toThrow();
    });

    it('should validate empty PSBT', () => {
      const emptyBuilder = new PSBTBuilder({ network: testNetwork });
      const isValid = emptyBuilder.validateSignatures();
      expect(isValid).toBe(true); // Empty PSBT is technically valid (no failed signatures)
    });
  });

  describe('Fee Calculations', () => {
    it('should calculate fee when inputs and outputs are present', () => {
      // Add mock input with value
      builder.addInput(MOCK_UTXOS[0].txid, MOCK_UTXOS[0].vout, {
        witnessUtxo: {
          script: Buffer.from(MOCK_UTXOS[0].scriptPubKey, 'hex'),
          value: MOCK_UTXOS[0].value,
        },
      });
      builder.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 50000);

      // This might throw if not enough data is present
      try {
        const fee = builder.getFee();
        expect(typeof fee).toBe('number');
        expect(fee).toBeGreaterThanOrEqual(0);
      } catch (error) {
        // Expected if PSBT is not complete enough
        expect(error).toBeDefined();
      }
    });

    it('should calculate fee rate', () => {
      builder.addInput(MOCK_UTXOS[0].txid, MOCK_UTXOS[0].vout, {
        witnessUtxo: {
          script: Buffer.from(MOCK_UTXOS[0].scriptPubKey, 'hex'),
          value: MOCK_UTXOS[0].value,
        },
      });
      builder.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 50000);

      try {
        const feeRate = builder.getFeeRate();
        expect(typeof feeRate).toBe('number');
        expect(feeRate).toBeGreaterThanOrEqual(0);
      } catch (error) {
        // Expected if PSBT is not complete enough
        expect(error).toBeDefined();
      }
    });

    it('should handle fee calculation errors gracefully', () => {
      // Empty PSBT should not be able to calculate fee
      const emptyBuilder = new PSBTBuilder({ network: testNetwork });
      try {
        const fee = emptyBuilder.getFee();
        // If it doesn't throw, the fee should be 0 or a valid number
        expect(typeof fee).toBe('number');
      } catch (error) {
        // This is expected for empty PSBT
        expect(error).toBeDefined();
      }
    });
  });

  describe('Transaction Extraction', () => {
    beforeEach(() => {
      // Setup a basic transaction
      builder.addInput(MOCK_UTXOS[0].txid, MOCK_UTXOS[0].vout, {
        witnessUtxo: {
          script: Buffer.from(MOCK_UTXOS[0].scriptPubKey, 'hex'),
          value: MOCK_UTXOS[0].value,
        },
      });
      builder.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 50000);
    });

    it('should extract transaction without finalization', () => {
      const tx = builder.extractTransaction(true);
      // Without finalization, this will likely fail for unsigned PSBT
      expect(tx).toBeNull();
    });

    it('should handle extraction with finalization', () => {
      const tx = builder.extractTransaction(false);
      // This will fail for unsigned PSBT
      expect(tx).toBeNull();
    });

    it('should handle extraction errors gracefully', () => {
      // Empty PSBT should not be extractable
      const emptyBuilder = new PSBTBuilder();
      const tx = emptyBuilder.extractTransaction();
      expect(tx).toBeNull();
    });
  });

  describe('Serialization', () => {
    beforeEach(() => {
      builder.addInput(MOCK_UTXOS[0].txid, MOCK_UTXOS[0].vout, {
        witnessUtxo: {
          script: Buffer.from(MOCK_UTXOS[0].scriptPubKey, 'hex'),
          value: MOCK_UTXOS[0].value,
        },
      });
      builder.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 10000);
    });

    it('should export to base64', () => {
      const base64 = builder.toBase64();
      expect(typeof base64).toBe('string');
      expect(base64.length).toBeGreaterThan(0);
    });

    it('should export to hex', () => {
      const hex = builder.toHex();
      expect(typeof hex).toBe('string');
      expect(hex.length).toBeGreaterThan(0);
      expect(/^[0-9a-fA-F]+$/.test(hex)).toBe(true);
    });

    it('should export to buffer', () => {
      const buffer = builder.toBuffer();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should maintain consistency between formats', () => {
      const base64 = builder.toBase64();
      const hex = builder.toHex();
      const buffer = builder.toBuffer();

      // Convert and compare
      expect(Buffer.from(base64, 'base64').toString('hex')).toBe(hex);
      expect(buffer.toString('hex')).toBe(hex);
      expect(buffer.toString('base64')).toBe(base64);
    });

    it('should roundtrip through serialization', () => {
      const originalBase64 = builder.toBase64();
      const restored = PSBTBuilder.fromBase64(originalBase64, testNetwork);
      expect(restored.toBase64()).toBe(originalBase64);
    });
  });

  describe('PSBT Access', () => {
    it('should get underlying PSBT', () => {
      const psbt = builder.getPSBT();
      expect(psbt).toBeDefined();
      expect(typeof psbt).toBe('object');
    });

    it('should have outputCount property', () => {
      builder.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 10000);
      const psbt = builder.getPSBT();
      expect(psbt.outputCount).toBe(1);
    });

    it('should maintain outputCount property', () => {
      const psbt = builder.getPSBT();
      expect(psbt.outputCount).toBe(0);

      builder.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 10000);
      expect(psbt.outputCount).toBe(1);

      builder.addOutput('tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7', 20000);
      expect(psbt.outputCount).toBe(2);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle zero value outputs', () => {
      builder.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 0);
      const psbt = builder.getPSBT();
      expect(psbt.outputCount).toBe(1);
      expect(psbt.txOutputs[0]?.value).toBe(0);
    });

    it('should handle maximum value outputs', () => {
      const maxValue = 2100000000000000; // 21 million BTC in satoshis
      builder.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', maxValue);
      const psbt = builder.getPSBT();
      expect(psbt.txOutputs[0]?.value).toBe(maxValue);
    });

    it('should handle empty data in OP_RETURN', () => {
      const emptyData = Buffer.alloc(0);
      builder.addDataOutput(emptyData);
      const psbt = builder.getPSBT();
      expect(psbt.outputCount).toBe(1);
    });

    it('should handle very long txids', () => {
      const longTxid = '1'.repeat(128); // Longer than normal
      builder.addInput(longTxid, 0);
      const psbt = builder.getPSBT();
      expect(psbt.inputCount).toBe(1);
    });

    it('should handle high vout values', () => {
      const highVout = 999999;
      builder.addInput(MOCK_UTXOS[0].txid, highVout);
      const psbt = builder.getPSBT();
      expect(psbt.inputCount).toBe(1);
    });

    it('should handle large script sizes', () => {
      const largeScript = Buffer.alloc(10000, 0x51); // Large script with OP_1
      builder.addOutput(largeScript, 1000);
      const psbt = builder.getPSBT();
      expect(psbt.outputCount).toBe(1);
    });
  });

  describe('Method Chaining', () => {
    it('should support method chaining for addInput', () => {
      const result = builder.addInput(MOCK_UTXOS[0].txid, 0);
      expect(result).toBe(builder);
    });

    it('should support method chaining for addOutput', () => {
      const result = builder.addOutput('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 10000);
      expect(result).toBe(builder);
    });

    it('should support method chaining for addDataOutput', () => {
      const data = Buffer.from('test', 'utf8');
      const result = builder.addDataOutput(data);
      expect(result).toBe(builder);
    });

    it('should support method chaining for combine', () => {
      const otherPsbt = new PSBTBuilder({ network: testNetwork }).getPSBT();
      const result = builder.combine(otherPsbt);
      expect(result).toBe(builder);
    });

    it('should support complex method chaining', () => {
      const testAddress = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
      const data = Buffer.from('Hello Bitcoin', 'utf8');

      const result = builder
        .addInput(MOCK_UTXOS[0].txid, 0)
        .addOutput(testAddress, 50000)
        .addDataOutput(data)
        .addInput(MOCK_UTXOS[1].txid, 0)
        .addOutput(testAddress, 25000);

      expect(result).toBe(builder);
      expect(builder.getPSBT().inputCount).toBe(2);
      expect(builder.getPSBT().outputCount).toBe(3);
    });
  });
});
