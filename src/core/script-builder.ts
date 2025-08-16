/**
 * Bitcoin Script Builder
 * Utilities for creating various Bitcoin scripts
 */

import { Buffer } from 'node:buffer';

import * as bitcoin from 'bitcoinjs-lib';
import type { Network } from 'bitcoinjs-lib';

export class ScriptBuilder {
  private network: Network;

  constructor(network: Network = bitcoin.networks.bitcoin) {
    this.network = network;
  }

  /**
   * Create P2PKH (Pay to Public Key Hash) script
   */
  createP2PKH(address: string): Buffer {
    const payment = bitcoin.payments.p2pkh({
      address,
      network: this.network,
    });
    if (!payment.output) {
      throw new Error('Failed to create P2PKH script');
    }
    return payment.output;
  }

  /**
   * Create P2WPKH (Pay to Witness Public Key Hash) script
   */
  createP2WPKH(address: string): Buffer {
    const payment = bitcoin.payments.p2wpkh({
      address,
      network: this.network,
    });
    if (!payment.output) {
      throw new Error('Failed to create P2WPKH script');
    }
    return payment.output;
  }

  /**
   * Create P2SH (Pay to Script Hash) script
   */
  createP2SH(redeemScript: Buffer): Buffer {
    const payment = bitcoin.payments.p2sh({
      redeem: { output: redeemScript },
      network: this.network,
    });
    if (!payment.output) {
      throw new Error('Failed to create P2SH script');
    }
    return payment.output;
  }

  /**
   * Create P2WSH (Pay to Witness Script Hash) script
   */
  createP2WSH(witnessScript: Buffer): Buffer {
    const payment = bitcoin.payments.p2wsh({
      redeem: { output: witnessScript },
      network: this.network,
    });
    if (!payment.output) {
      throw new Error('Failed to create P2WSH script');
    }
    return payment.output;
  }

  /**
   * Create multisig script
   */
  createMultisig(m: number, pubkeys: Buffer[]): Buffer {
    const payment = bitcoin.payments.p2ms({
      m,
      pubkeys,
      network: this.network,
    });
    if (!payment.output) {
      throw new Error('Failed to create multisig script');
    }
    return payment.output;
  }

  /**
   * Create OP_RETURN script
   */
  createOpReturn(data: Buffer | Buffer[]): Buffer {
    const dataArray = Array.isArray(data) ? data : [data];
    const payment = bitcoin.payments.embed({
      data: dataArray,
    });
    if (!payment.output) {
      throw new Error('Failed to create OP_RETURN script');
    }
    return payment.output;
  }

  /**
   * Create bare multisig for stamps (1-of-2 or 1-of-3)
   */
  createBareMultisigForStamps(
    pubkeys: Buffer[],
    _dataChunks: Buffer[],
  ): Buffer { // Interface requires: dataChunks
    if (pubkeys.length < 2 || pubkeys.length > 3) {
      throw new Error('Bare multisig requires 2 or 3 public keys');
    }

    const multisigNumberEncoded = bitcoin.script.number.encode(pubkeys.length);
    if (multisigNumberEncoded === undefined) {
      throw new Error('Failed to encode multisig number');
    }

    const script = bitcoin.script.compile([
      bitcoin.opcodes.OP_1!, // 1-of-n multisig
      ...pubkeys,
      multisigNumberEncoded,
      bitcoin.opcodes.OP_CHECKMULTISIG!,
    ]);

    return script;
  }

  /**
   * Create P2SH-wrapped multisig
   */
  createP2SHMultisig(
    m: number,
    pubkeys: Buffer[],
  ): {
    address: string;
    redeemScript: Buffer;
    scriptPubKey: Buffer;
  } {
    const redeemScript = this.createMultisig(m, pubkeys);
    const payment = bitcoin.payments.p2sh({
      redeem: { output: redeemScript },
      network: this.network,
    });

    if (!payment.address || !payment.output) {
      throw new Error('Failed to create P2SH multisig');
    }

    return {
      address: payment.address,
      redeemScript,
      scriptPubKey: payment.output,
    };
  }

  /**
   * Create timelocked script
   */
  createTimelocked(locktime: number, pubkey: Buffer): Buffer {
    const locktimeNumberEncoded = bitcoin.script.number.encode(locktime);
    if (locktimeNumberEncoded === undefined) {
      throw new Error('Failed to encode locktime');
    }

    const script = bitcoin.script.compile([
      locktimeNumberEncoded,
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY!,
      bitcoin.opcodes.OP_DROP!,
      pubkey,
      bitcoin.opcodes.OP_CHECKSIG!,
    ]);
    return script;
  }

  /**
   * Parse script to identify type
   */
  identifyScript(script: Buffer): string {
    try {
      // Try P2PKH
      const p2pkh = bitcoin.payments.p2pkh({
        output: script,
        network: this.network,
      });
      if (p2pkh.address) return 'p2pkh';
    } catch (error) {
      // Ignore parsing errors, will be handled by fallback detection
      console.debug('Script parsing error', error);
    }

    try {
      // Try P2WPKH
      const p2wpkh = bitcoin.payments.p2wpkh({
        output: script,
        network: this.network,
      });
      if (p2wpkh.address) return 'p2wpkh';
    } catch (error) {
      // Ignore parsing errors, will be handled by fallback detection
      console.debug('Script parsing error', error);
    }

    try {
      // Try P2SH
      const p2sh = bitcoin.payments.p2sh({
        output: script,
        network: this.network,
      });
      if (p2sh.address) return 'p2sh';
    } catch (error) {
      // Ignore parsing errors, will be handled by fallback detection
      console.debug('Script parsing error', error);
    }

    try {
      // Try P2WSH
      const p2wsh = bitcoin.payments.p2wsh({
        output: script,
        network: this.network,
      });
      if (p2wsh.address) return 'p2wsh';
    } catch (error) {
      // Ignore parsing errors, will be handled by fallback detection
      console.debug('Script parsing error', error);
    }

    try {
      // Try multisig
      const p2ms = bitcoin.payments.p2ms({
        output: script,
        network: this.network,
      });
      if (p2ms.m !== undefined) return `p2ms-${p2ms.m}-of-${p2ms.n}`;
    } catch (error) {
      // Ignore parsing errors, will be handled by fallback detection
      console.debug('Script parsing error', error);
    }

    // Check for OP_RETURN
    const decompiled = bitcoin.script.decompile(script);
    if (decompiled && decompiled[0] === bitcoin.opcodes.OP_RETURN) {
      return 'op_return';
    }

    return 'unknown';
  }

  /**
   * Validate script
   */
  isValidScript(script: Buffer): boolean {
    try {
      bitcoin.script.decompile(script);
      return true;
    } catch {
      return false;
    }
  }
}
