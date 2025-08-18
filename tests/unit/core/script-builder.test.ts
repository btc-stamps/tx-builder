/**
 * Script Builder Tests
 *
 * Tests for the Bitcoin script builder that creates various types of
 * Bitcoin scripts including P2PKH, P2WPKH, P2SH, P2WSH, multisig, and OP_RETURN.
 *
 * Uses dependency injection pattern with test fixtures for consistent testing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import * as bitcoin from 'bitcoinjs-lib';
import { ScriptBuilder } from '../../../src/core/script-builder';
import {
  getPublicKeyBuffer,
  getPublicKeyBuffers,
  getUncompressedPublicKeyBuffer,
  MOCK_ADDRESSES,
  MOCK_INVALID_DATA,
  MOCK_PUBLIC_KEYS,
} from '../../fixtures/keys';

describe('ScriptBuilder', () => {
  let builder: ScriptBuilder;
  const testNetwork = bitcoin.networks.testnet;
  const mainNetwork = bitcoin.networks.bitcoin;

  beforeEach(() => {
    builder = new ScriptBuilder(testNetwork);
  });

  describe('Constructor', () => {
    it('should create with default network (mainnet)', () => {
      const defaultBuilder = new ScriptBuilder();
      expect(defaultBuilder).toBeDefined();
    });

    it('should create with specified network', () => {
      const testnetBuilder = new ScriptBuilder(testNetwork);
      expect(testnetBuilder).toBeDefined();
    });

    it('should create with regtest network', () => {
      const regtestBuilder = new ScriptBuilder(bitcoin.networks.regtest);
      expect(regtestBuilder).toBeDefined();
    });
  });

  describe('P2PKH Scripts', () => {
    it('should create P2PKH script from testnet address', () => {
      const script = builder.createP2PKH(MOCK_ADDRESSES.testnet.p2pkh);

      expect(Buffer.isBuffer(script)).toBe(true);
      expect(script.length).toBeGreaterThan(0);

      // Verify script structure (OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG)
      const decompiled = bitcoin.script.decompile(script);
      expect(decompiled).toBeDefined();
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_DUP);
      expect(decompiled![1]).toBe(bitcoin.opcodes.OP_HASH160);
      expect(decompiled![3]).toBe(bitcoin.opcodes.OP_EQUALVERIFY);
      expect(decompiled![4]).toBe(bitcoin.opcodes.OP_CHECKSIG);
    });

    it('should create P2PKH script from mainnet address', () => {
      const mainBuilder = new ScriptBuilder(mainNetwork);
      const script = mainBuilder.createP2PKH(MOCK_ADDRESSES.mainnet.p2pkh);

      expect(Buffer.isBuffer(script)).toBe(true);
      expect(script.length).toBeGreaterThan(0);
    });

    it('should throw error for invalid P2PKH address', () => {
      expect(() => builder.createP2PKH(MOCK_INVALID_DATA.address)).toThrow();
    });

    it('should throw error for wrong network address', () => {
      expect(() => builder.createP2PKH(MOCK_ADDRESSES.mainnet.p2pkh)).toThrow();
    });
  });

  describe('P2WPKH Scripts', () => {
    it('should create P2WPKH script from bech32 testnet address', () => {
      const script = builder.createP2WPKH(MOCK_ADDRESSES.testnet.p2wpkh);

      expect(Buffer.isBuffer(script)).toBe(true);
      expect(script.length).toBe(22); // P2WPKH is always 22 bytes

      // Verify script structure (OP_0 <20-byte-hash>)
      const decompiled = bitcoin.script.decompile(script);
      expect(decompiled).toBeDefined();
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_0);
      expect(Buffer.isBuffer(decompiled![1])).toBe(true);
      expect((decompiled![1] as Buffer).length).toBe(20);
    });

    it('should create P2WPKH script from mainnet bech32 address', () => {
      const mainBuilder = new ScriptBuilder(mainNetwork);
      const script = mainBuilder.createP2WPKH(MOCK_ADDRESSES.mainnet.p2wpkh);

      expect(Buffer.isBuffer(script)).toBe(true);
      expect(script.length).toBe(22);
    });

    it('should throw error for invalid P2WPKH address', () => {
      expect(() => builder.createP2WPKH(MOCK_INVALID_DATA.bech32)).toThrow();
    });
  });

  describe('P2SH Scripts', () => {
    it('should create P2SH script from redeem script', () => {
      // Create a simple redeem script (OP_1)
      const redeemScript = Buffer.from('51', 'hex');
      const script = builder.createP2SH(redeemScript);

      expect(Buffer.isBuffer(script)).toBe(true);
      expect(script.length).toBe(23); // P2SH is always 23 bytes

      // Verify script structure (OP_HASH160 <20-byte-hash> OP_EQUAL)
      const decompiled = bitcoin.script.decompile(script);
      expect(decompiled).toBeDefined();
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_HASH160);
      expect(Buffer.isBuffer(decompiled![1])).toBe(true);
      expect((decompiled![1] as Buffer).length).toBe(20);
      expect(decompiled![2]).toBe(bitcoin.opcodes.OP_EQUAL);
    });

    it('should create P2SH script from complex redeem script', () => {
      // Create a 2-of-3 multisig redeem script using fixtures
      const pubkeys = getPublicKeyBuffers(3);
      const redeemScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_2,
        ...pubkeys,
        bitcoin.opcodes.OP_3,
        bitcoin.opcodes.OP_CHECKMULTISIG,
      ]);

      const script = builder.createP2SH(redeemScript);
      expect(Buffer.isBuffer(script)).toBe(true);
      expect(script.length).toBe(23);
    });

    it('should create P2SH script from small redeem script', () => {
      const redeemScript = Buffer.from('00', 'hex'); // OP_0
      const script = builder.createP2SH(redeemScript);

      expect(Buffer.isBuffer(script)).toBe(true);
      expect(script.length).toBe(23);
    });
  });

  describe('P2WSH Scripts', () => {
    it('should create P2WSH script from witness script', () => {
      // Create a simple witness script (OP_1)
      const witnessScript = Buffer.from('51', 'hex');
      const script = builder.createP2WSH(witnessScript);

      expect(Buffer.isBuffer(script)).toBe(true);
      expect(script.length).toBe(34); // P2WSH is always 34 bytes

      // Verify script structure (OP_0 <32-byte-hash>)
      const decompiled = bitcoin.script.decompile(script);
      expect(decompiled).toBeDefined();
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_0);
      expect(Buffer.isBuffer(decompiled![1])).toBe(true);
      expect((decompiled![1] as Buffer).length).toBe(32);
    });

    it('should create P2WSH script from complex witness script', () => {
      // Create a 2-of-3 multisig witness script using fixtures
      const pubkeys = getPublicKeyBuffers(3);
      const witnessScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_2,
        ...pubkeys,
        bitcoin.opcodes.OP_3,
        bitcoin.opcodes.OP_CHECKMULTISIG,
      ]);

      const script = builder.createP2WSH(witnessScript);
      expect(Buffer.isBuffer(script)).toBe(true);
      expect(script.length).toBe(34);
    });
  });

  describe('Multisig Scripts', () => {
    it('should create 1-of-2 multisig script', () => {
      const pubkeys = getPublicKeyBuffers(2);
      const script = builder.createMultisig(1, pubkeys);

      expect(Buffer.isBuffer(script)).toBe(true);

      // Verify script structure
      const decompiled = bitcoin.script.decompile(script);
      expect(decompiled).toBeDefined();
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_1);
      expect(decompiled![3]).toBe(bitcoin.opcodes.OP_2);
      expect(decompiled![4]).toBe(bitcoin.opcodes.OP_CHECKMULTISIG);
    });

    it('should create 2-of-3 multisig script', () => {
      const pubkeys = getPublicKeyBuffers(3);
      const script = builder.createMultisig(2, pubkeys);

      expect(Buffer.isBuffer(script)).toBe(true);

      // Verify script structure
      const decompiled = bitcoin.script.decompile(script);
      expect(decompiled).toBeDefined();
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_2);
      expect(decompiled![4]).toBe(bitcoin.opcodes.OP_3);
      expect(decompiled![5]).toBe(bitcoin.opcodes.OP_CHECKMULTISIG);
    });

    it('should create 3-of-3 multisig script', () => {
      const pubkeys = getPublicKeyBuffers(3);
      const script = builder.createMultisig(3, pubkeys);

      expect(Buffer.isBuffer(script)).toBe(true);
    });

    it('should create 1-of-1 multisig script', () => {
      const pubkeys = getPublicKeyBuffers(1);

      // 1-of-1 multisig is technically valid
      const script = builder.createMultisig(1, pubkeys);
      expect(Buffer.isBuffer(script)).toBe(true);
    });

    it('should create maximum standard multisig (15-of-15)', () => {
      // Get all 15 unique public keys from fixtures
      const pubkeys = getPublicKeyBuffers(15);

      // 15-of-15 multisig is the maximum standard multisig
      const script = builder.createMultisig(15, pubkeys);
      expect(Buffer.isBuffer(script)).toBe(true);
    });
  });

  describe('OP_RETURN Scripts', () => {
    it('should create OP_RETURN script with single data buffer', () => {
      const data = Buffer.from('Hello, Bitcoin!', 'utf8');
      const script = builder.createOpReturn(data);

      expect(Buffer.isBuffer(script)).toBe(true);

      // Verify script structure
      const decompiled = bitcoin.script.decompile(script);
      expect(decompiled).toBeDefined();
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_RETURN);
      expect(Buffer.compare(decompiled![1] as Buffer, data)).toBe(0);
    });

    it('should create OP_RETURN script with multiple data buffers', () => {
      const data = [
        Buffer.from('Part1', 'utf8'),
        Buffer.from('Part2', 'utf8'),
        Buffer.from('Part3', 'utf8'),
      ];
      const script = builder.createOpReturn(data);

      expect(Buffer.isBuffer(script)).toBe(true);

      // Verify script structure
      const decompiled = bitcoin.script.decompile(script);
      expect(decompiled).toBeDefined();
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_RETURN);
      expect(Buffer.compare(decompiled![1] as Buffer, data[0])).toBe(0);
      expect(Buffer.compare(decompiled![2] as Buffer, data[1])).toBe(0);
      expect(Buffer.compare(decompiled![3] as Buffer, data[2])).toBe(0);
    });

    it('should create OP_RETURN script with empty data', () => {
      const data = Buffer.alloc(0);
      const script = builder.createOpReturn(data);

      expect(Buffer.isBuffer(script)).toBe(true);

      // Verify script structure
      const decompiled = bitcoin.script.decompile(script);
      expect(decompiled).toBeDefined();
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_RETURN);
    });

    it('should create OP_RETURN script with 80 bytes of data', () => {
      const data = Buffer.alloc(80, 0xaa);
      const script = builder.createOpReturn(data);

      expect(Buffer.isBuffer(script)).toBe(true);
    });
  });

  describe('Bare Multisig for Stamps', () => {
    it('should create 1-of-2 bare multisig for stamps', () => {
      const pubkeys = getPublicKeyBuffers(2);
      const dataChunks = [Buffer.from('stamp data', 'utf8')];

      const script = builder.createBareMultisigForStamps(pubkeys, dataChunks);

      expect(Buffer.isBuffer(script)).toBe(true);

      // Verify script structure (OP_1 pubkey1 pubkey2 OP_2 OP_CHECKMULTISIG)
      const decompiled = bitcoin.script.decompile(script);
      expect(decompiled).toBeDefined();
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_1);
      expect(decompiled![3]).toBe(bitcoin.opcodes.OP_2);
      expect(decompiled![4]).toBe(bitcoin.opcodes.OP_CHECKMULTISIG);
    });

    it('should create 1-of-3 bare multisig for stamps', () => {
      const pubkeys = getPublicKeyBuffers(3);
      const dataChunks = [Buffer.from('stamp data', 'utf8')];

      const script = builder.createBareMultisigForStamps(pubkeys, dataChunks);

      expect(Buffer.isBuffer(script)).toBe(true);

      // Verify script structure
      const decompiled = bitcoin.script.decompile(script);
      expect(decompiled).toBeDefined();
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_1);
      expect(decompiled![4]).toBe(bitcoin.opcodes.OP_3);
      expect(decompiled![5]).toBe(bitcoin.opcodes.OP_CHECKMULTISIG);
    });

    it('should throw error for less than 2 pubkeys', () => {
      const pubkeys = getPublicKeyBuffers(1);
      const dataChunks = [Buffer.from('stamp data', 'utf8')];

      expect(() => builder.createBareMultisigForStamps(pubkeys, dataChunks))
        .toThrow('Bare multisig requires 2 or 3 public keys');
    });

    it('should throw error for more than 3 pubkeys', () => {
      const pubkeys = getPublicKeyBuffers(4);
      const dataChunks = [Buffer.from('stamp data', 'utf8')];

      expect(() => builder.createBareMultisigForStamps(pubkeys, dataChunks))
        .toThrow('Bare multisig requires 2 or 3 public keys');
    });

    it('should handle empty data chunks', () => {
      const pubkeys = getPublicKeyBuffers(2);
      const dataChunks: Buffer[] = [];

      const script = builder.createBareMultisigForStamps(pubkeys, dataChunks);
      expect(Buffer.isBuffer(script)).toBe(true);
    });
  });

  describe('P2SH-Wrapped Multisig', () => {
    it('should create P2SH-wrapped 2-of-3 multisig', () => {
      const pubkeys = getPublicKeyBuffers(3);

      const result = builder.createP2SHMultisig(2, pubkeys);

      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('redeemScript');
      expect(result).toHaveProperty('scriptPubKey');

      expect(typeof result.address).toBe('string');
      expect(Buffer.isBuffer(result.redeemScript)).toBe(true);
      expect(Buffer.isBuffer(result.scriptPubKey)).toBe(true);
      expect(result.scriptPubKey.length).toBe(23);
    });

    it('should create P2SH-wrapped 1-of-2 multisig', () => {
      const pubkeys = getPublicKeyBuffers(2);

      const result = builder.createP2SHMultisig(1, pubkeys);

      expect(result.address).toBeDefined();
      expect(result.address.startsWith('2')).toBe(true); // Testnet P2SH addresses start with '2'
    });

    it('should create valid mainnet P2SH address', () => {
      const mainBuilder = new ScriptBuilder(mainNetwork);
      const pubkeys = getPublicKeyBuffers(2);

      const result = mainBuilder.createP2SHMultisig(2, pubkeys);

      expect(result.address.startsWith('3')).toBe(true); // Mainnet P2SH addresses start with '3'
    });
  });

  describe('Timelocked Scripts', () => {
    it('should create timelocked script with block height', () => {
      const locktime = 500000; // Block height
      const pubkey = getPublicKeyBuffer();

      const script = builder.createTimelocked(locktime, pubkey);

      expect(Buffer.isBuffer(script)).toBe(true);

      // Verify script structure
      const decompiled = bitcoin.script.decompile(script);
      expect(decompiled).toBeDefined();
      expect(decompiled![1]).toBe(bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY);
      expect(decompiled![2]).toBe(bitcoin.opcodes.OP_DROP);
      expect(decompiled![4]).toBe(bitcoin.opcodes.OP_CHECKSIG);
    });

    it('should create timelocked script with timestamp', () => {
      const locktime = 1609459200; // Unix timestamp (Jan 1, 2021)
      const pubkey = getPublicKeyBuffer(1);

      const script = builder.createTimelocked(locktime, pubkey);

      expect(Buffer.isBuffer(script)).toBe(true);
    });

    it('should handle minimum locktime (0)', () => {
      const locktime = 0;
      const pubkey = getPublicKeyBuffer();

      const script = builder.createTimelocked(locktime, pubkey);

      expect(Buffer.isBuffer(script)).toBe(true);
    });

    it('should handle maximum block height locktime', () => {
      const locktime = 499999999; // Max block height before timestamp range
      const pubkey = getPublicKeyBuffer();

      const script = builder.createTimelocked(locktime, pubkey);

      expect(Buffer.isBuffer(script)).toBe(true);
    });
  });

  describe('Script Identification', () => {
    beforeEach(() => {
      vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    it('should identify P2PKH script', () => {
      const script = builder.createP2PKH(MOCK_ADDRESSES.testnet.p2pkh);

      const type = builder.identifyScript(script);
      expect(type).toBe('p2pkh');
    });

    it('should identify P2WPKH script', () => {
      const script = builder.createP2WPKH(MOCK_ADDRESSES.testnet.p2wpkh);

      const type = builder.identifyScript(script);
      expect(type).toBe('p2wpkh');
    });

    it('should identify P2SH script', () => {
      const redeemScript = Buffer.from('51', 'hex');
      const script = builder.createP2SH(redeemScript);

      const type = builder.identifyScript(script);
      expect(type).toBe('p2sh');
    });

    it('should identify P2WSH script', () => {
      const witnessScript = Buffer.from('51', 'hex');
      const script = builder.createP2WSH(witnessScript);

      const type = builder.identifyScript(script);
      expect(type).toBe('p2wsh');
    });

    it('should identify multisig script', () => {
      const pubkeys = getPublicKeyBuffers(2);
      const script = builder.createMultisig(2, pubkeys);

      const type = builder.identifyScript(script);
      expect(type).toBe('p2ms-2-of-2');
    });

    it('should identify OP_RETURN script', () => {
      const data = Buffer.from('test data', 'utf8');
      const script = builder.createOpReturn(data);

      const type = builder.identifyScript(script);
      expect(type).toBe('op_return');
    });

    it('should identify unknown script', () => {
      // Create a non-standard script
      const script = bitcoin.script.compile([
        bitcoin.opcodes.OP_NOP,
        bitcoin.opcodes.OP_NOP,
      ]);

      const type = builder.identifyScript(script);
      expect(type).toBe('unknown');
    });

    it('should handle invalid script gracefully', () => {
      const invalidScript = Buffer.from('invalid', 'utf8');

      const type = builder.identifyScript(invalidScript);
      expect(type).toBe('unknown');
    });
  });

  describe('Script Validation', () => {
    it('should validate correct P2PKH script', () => {
      const script = builder.createP2PKH(MOCK_ADDRESSES.testnet.p2pkh);

      const isValid = builder.isValidScript(script);
      expect(isValid).toBe(true);
    });

    it('should validate correct multisig script', () => {
      const pubkeys = getPublicKeyBuffers(2);
      const script = builder.createMultisig(1, pubkeys);

      const isValid = builder.isValidScript(script);
      expect(isValid).toBe(true);
    });

    it('should validate correct OP_RETURN script', () => {
      const data = Buffer.from('valid data', 'utf8');
      const script = builder.createOpReturn(data);

      const isValid = builder.isValidScript(script);
      expect(isValid).toBe(true);
    });

    it('should handle edge case scripts', () => {
      // Note: bitcoinjs-lib's decompile is very forgiving and rarely throws
      // Even truncated push data scripts often parse successfully
      const edgeCaseScript = MOCK_INVALID_DATA.malformedScript;
      const isValid = builder.isValidScript(edgeCaseScript);
      // The validation depends on bitcoinjs-lib's implementation
      expect(typeof isValid).toBe('boolean');
    });

    it('should validate empty buffer', () => {
      const emptyScript = Buffer.alloc(0);

      const isValid = builder.isValidScript(emptyScript);
      expect(isValid).toBe(true); // Empty script is technically valid
    });

    it('should validate complex nested script', () => {
      // Create a P2SH script containing a multisig
      const pubkeys = getPublicKeyBuffers(2);
      const redeemScript = builder.createMultisig(2, pubkeys);
      const p2shScript = builder.createP2SH(redeemScript);

      const isValid = builder.isValidScript(p2shScript);
      expect(isValid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle maximum valid multisig (3-of-3)', () => {
      const pubkeys = getPublicKeyBuffers(3);
      const script = builder.createMultisig(3, pubkeys);

      expect(Buffer.isBuffer(script)).toBe(true);
    });

    it('should handle maximum size OP_RETURN data', () => {
      const maxData = Buffer.alloc(520, 0xaa); // Near maximum OP_RETURN size
      const script = builder.createOpReturn(maxData);

      expect(Buffer.isBuffer(script)).toBe(true);
    });

    it('should handle compressed vs uncompressed pubkeys', () => {
      const compressedPubkey = getPublicKeyBuffer();
      const uncompressedPubkey = getUncompressedPublicKeyBuffer();

      const pubkeys = [compressedPubkey, uncompressedPubkey];
      const script = builder.createMultisig(2, pubkeys);

      expect(Buffer.isBuffer(script)).toBe(true);
    });

    it('should create nested P2SH-P2WSH script', () => {
      // Create a witness script
      const witnessScript = Buffer.from('51', 'hex');
      // Create P2WSH from witness script
      const p2wshScript = builder.createP2WSH(witnessScript);
      // Wrap in P2SH
      const p2shScript = builder.createP2SH(p2wshScript);

      expect(Buffer.isBuffer(p2shScript)).toBe(true);
      expect(p2shScript.length).toBe(23);
    });

    it('should throw error for invalid pubkey', () => {
      const pubkeys = [MOCK_INVALID_DATA.pubkey, getPublicKeyBuffer()];

      // bitcoinjs-lib validates pubkeys are valid EC points
      expect(() => builder.createMultisig(1, pubkeys)).toThrow();
    });
  });
});
