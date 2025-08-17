/**
 * SRC-20 Decoder Utility
 *
 * Utility for decoding SRC-20 data from various sources including
 * raw transactions, hex data, and P2WSH outputs.
 */

import * as bitcoin from 'bitcoinjs-lib';
import { Buffer } from 'node:buffer';
import { SRC20Encoder } from '../encoders/src20-encoder.ts';
import type { SRC20Data } from '../interfaces/src20.interface.ts';

/**
 * Standalone SRC-20 decoder utility
 */
export class SRC20Decoder {
  private encoder: SRC20Encoder;

  constructor(network: bitcoin.Network = bitcoin.networks.bitcoin) {
    this.encoder = new SRC20Encoder(network);
  }

  /**
   * Decode SRC-20 data from transaction hex
   */
  async decodeFromTxHex(txHex: string): Promise<SRC20Data | null> {
    try {
      const tx = bitcoin.Transaction.fromHex(txHex);
      return await this.encoder.decode(tx);
    } catch (error) {
      console.error('Error decoding transaction hex:', error);
      return null;
    }
  }

  /**
   * Decode SRC-20 data from transaction ID
   * Note: This requires a provider to fetch the transaction
   */
  async decodeFromTxid(txid: string, provider?: any): Promise<SRC20Data | null> {
    if (!provider || !provider.getTransaction) {
      throw new Error('Provider with getTransaction method required');
    }

    try {
      const txData = await provider.getTransaction(txid);
      if (!txData || !txData.hex) {
        return null;
      }

      return await this.decodeFromTxHex(txData.hex);
    } catch (error) {
      console.error('Error fetching transaction:', error);
      return null;
    }
  }

  /**
   * Decode SRC-20 data from P2WSH outputs
   */
  async decodeFromOutputs(
    outputs: Array<{ script: Buffer; value: number }>,
  ): Promise<SRC20Data | null> {
    return await this.encoder.decodeFromOutputs(outputs);
  }

  /**
   * Validate that data is valid SRC-20
   */
  validate(data: any): boolean {
    return this.encoder.validate(data);
  }

  /**
   * Get validation errors for SRC-20 data
   */
  getValidationErrors(data: SRC20Data): string[] {
    return this.encoder.getValidationErrors(data);
  }

  /**
   * Check if a transaction contains SRC-20 data
   */
  async containsSRC20Data(tx: bitcoin.Transaction): Promise<boolean> {
    try {
      const decoded = await this.encoder.decode(tx);
      return decoded !== null;
    } catch {
      return false;
    }
  }

  /**
   * Extract SRC-20 operation type from transaction
   */
  async getOperationType(tx: bitcoin.Transaction): Promise<string | null> {
    try {
      const decoded = await this.encoder.decode(tx);
      return decoded?.op || null;
    } catch {
      return null;
    }
  }

  /**
   * Extract ticker symbol from transaction
   */
  async getTickerSymbol(tx: bitcoin.Transaction): Promise<string | null> {
    try {
      const decoded = await this.encoder.decode(tx);
      return decoded?.tick || null;
    } catch {
      return null;
    }
  }
}

/**
 * Create a new SRC-20 decoder instance
 */
export function createSRC20Decoder(
  network: bitcoin.Network = bitcoin.networks.bitcoin,
): SRC20Decoder {
  return new SRC20Decoder(network);
}

/**
 * Decode SRC-20 data from transaction hex (convenience function)
 */
export async function decodeSRC20FromHex(
  txHex: string,
  network?: bitcoin.Network,
): Promise<SRC20Data | null> {
  const decoder = new SRC20Decoder(network);
  return await decoder.decodeFromTxHex(txHex);
}

/**
 * Check if transaction hex contains SRC-20 data (convenience function)
 */
export async function isSRC20Transaction(
  txHex: string,
  network?: bitcoin.Network,
): Promise<boolean> {
  try {
    const decoder = new SRC20Decoder(network);
    const tx = bitcoin.Transaction.fromHex(txHex);
    return await decoder.containsSRC20Data(tx);
  } catch {
    return false;
  }
}
