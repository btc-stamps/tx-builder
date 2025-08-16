/**
 * Transaction Decoder Utility
 *
 * Provides functionality to decode and analyze Bitcoin transactions for:
 * - Bitcoin Stamps (Counterparty protocol with OP_RETURN + P2WSH)
 * - SRC-20 tokens (P2WSH only, no OP_RETURN)
 *
 * This utility validates that our transaction construction matches
 * the format of real transactions on the blockchain.
 */

import { Buffer } from 'node:buffer';

import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';

import { decodeTx as decodeCounterpartyTx } from '../encoders/counterparty-encoder.ts';
import {
  P2WSHAddressUtils as _P2WSHAddressUtils,
  SRC20Encoder,
} from '../encoders/src20-encoder.ts';
import process from 'node:process';

export interface DecodedTransaction {
  txid: string;
  version: number;
  locktime: number;
  inputs: DecodedInput[];
  outputs: DecodedOutput[];
  transactionType: 'stamp' | 'src20' | 'both' | 'unknown';
  counterpartyData?: CounterpartyDetails | undefined;
  src20Data?: SRC20Details | undefined;
  stampData?: StampDetails | undefined;
  summary: TransactionSummary;
}

export interface DecodedInput {
  index: number;
  previousTxid: string;
  previousVout: number;
  scriptSig?: string | undefined;
  witness?: string[] | undefined;
  value?: number | undefined;
  address?: string | undefined;
  type?: string | undefined;
}

export interface DecodedOutput {
  index: number;
  value: number;
  script: string;
  scriptType: string;
  address?: string | undefined;
  isOpReturn: boolean;
  isP2WSH: boolean;
  decodedData?: any;
}

export interface CounterpartyDetails {
  found: boolean;
  isEncrypted: boolean;
  prefix?: string | undefined;
  messageType?: number | undefined;
  messageTypeName?: string | undefined;
  assetName?: string | undefined;
  supply?: number | undefined;
  description?: string | undefined;
  stampFilename?: string | undefined;
  encodedData?: string | undefined;
  decodedData?: any;
}

export interface SRC20Details {
  found: boolean;
  protocol?: string | undefined;
  operation?: string | undefined;
  tick?: string | undefined;
  amount?: string | undefined;
  max?: string | undefined;
  lim?: string | undefined;
  dec?: number | undefined;
  metadata?: any;
  jsonData?: string | undefined;
  p2wshAddresses?: string[] | undefined;
}

export interface StampDetails {
  hasStampStructure: boolean;
  opReturnIndex?: number | undefined;
  p2wshOutputCount: number;
  p2wshOutputIndices: number[];
  totalP2WSHValue: number;
  dustValuePerOutput?: number | undefined;
  estimatedDataSize?: number | undefined;
  P2WSHData?: string | undefined;
}

export interface TransactionSummary {
  inputCount: number;
  outputCount: number;
  totalInputValue?: number | undefined;
  totalOutputValue: number;
  fee?: number | undefined;
  hasOpReturn: boolean;
  opReturnCount: number;
  p2wshCount: number;
  isLikelyStamp: boolean;
  isLikelySRC20: boolean;
  transactionType: string;
}

/**
 * Transaction Decoder Class
 */
export class TransactionDecoder {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private network: bitcoin.Network;
  private apiBaseUrl: string;
  private src20Encoder: SRC20Encoder;

  constructor(
    network: bitcoin.Network = bitcoin.networks.bitcoin,
    apiBaseUrl: string = 'https://mempool.space/api',
  ) {
    this.network = network;
    this.apiBaseUrl = apiBaseUrl;
    this.src20Encoder = new SRC20Encoder(network);
  }

  /**
   * Fetch and decode a transaction by its hash
   */
  async decodeByTxHash(txHash: string): Promise<DecodedTransaction> {
    try {
      // Fetch transaction data from API
      const response = await axios.get(`${this.apiBaseUrl}/tx/${txHash}`);
      const txData = response.data;

      // Decode the transaction
      return this.decodeTransactionData(txData, txHash);
    } catch (error: any) {
      throw new Error(
        `Failed to fetch transaction ${txHash}: ${error.message}`,
      );
    }
  }

  /**
   * Decode transaction data from API response
   */
  async decodeTransactionData(
    txData: any,
    txHash?: string,
  ): Promise<DecodedTransaction> {
    const decodedInputs = this.decodeInputs(txData.vin);
    const decodedOutputs = this.decodeOutputs(txData.vout);

    // Try to decode as Counterparty (Bitcoin Stamps)
    const counterpartyData = this.extractCounterpartyData(
      decodedOutputs,
      txHash || txData.txid,
    );

    // Try to decode as SRC-20
    const src20Data = await this.extractSRC20Data(decodedOutputs);

    // Analyze stamp structure
    const stampData = this.analyzeStampStructure(
      decodedOutputs,
      counterpartyData,
      src20Data,
    );

    // Determine transaction type
    const transactionType = this.determineTransactionType(
      counterpartyData,
      src20Data,
      stampData,
    );

    // Create summary
    const summary = this.createSummary(
      decodedInputs,
      decodedOutputs,
      stampData,
      src20Data,
      transactionType,
    );

    return {
      txid: txHash || txData.txid,
      version: txData.version,
      locktime: txData.locktime,
      inputs: decodedInputs,
      outputs: decodedOutputs,
      transactionType,
      counterpartyData,
      src20Data,
      stampData,
      summary,
    };
  }

  /**
   * Determine transaction type based on decoded data
   */
  private determineTransactionType(
    counterparty: CounterpartyDetails,
    src20: SRC20Details,
    stamp: StampDetails,
  ): 'stamp' | 'src20' | 'both' | 'unknown' {
    if (counterparty.found && src20.found) {
      return 'both'; // Unusual but possible
    } else if (counterparty.found || stamp.hasStampStructure) {
      return 'stamp';
    } else if (src20.found) {
      return 'src20';
    } else {
      return 'unknown';
    }
  }

  /**
   * Decode transaction inputs
   */
  private decodeInputs(vins: any[]): DecodedInput[] {
    return vins.map((vin, index) => {
      const decoded: DecodedInput = {
        index,
        previousTxid: vin.txid,
        previousVout: vin.vout,
        scriptSig: vin.scriptsig ?? undefined,
        witness: vin.witness ?? undefined,
        value: vin.prevout?.value ?? undefined,
        address: vin.prevout?.scriptpubkey_address ?? undefined,
        type: vin.prevout?.scriptpubkey_type ?? undefined,
      };

      return decoded;
    });
  }

  /**
   * Decode transaction outputs
   */
  private decodeOutputs(vouts: any[]): DecodedOutput[] {
    return vouts.map((vout, index) => {
      const scriptHex = vout.scriptpubkey || vout.scriptPubKey?.hex;
      const script = Buffer.from(scriptHex, 'hex');

      const decoded: DecodedOutput = {
        index,
        value: vout.value,
        script: scriptHex,
        scriptType: vout.scriptpubkey_type || this.detectScriptType(script),
        isOpReturn: false,
        isP2WSH: false,
      };

      // Add address if available
      if (vout.scriptpubkey_address) {
        decoded.address = vout.scriptpubkey_address;
      }

      // Detect OP_RETURN
      if (decoded.scriptType === 'op_return' || this.isOpReturn(script)) {
        decoded.isOpReturn = true;
        decoded.decodedData = this.decodeOpReturn(script);
      }

      // Detect P2WSH
      if (decoded.scriptType === 'v0_p2wsh' || this.isP2WSH(script)) {
        decoded.isP2WSH = true;
      }

      return decoded;
    });
  }

  /**
   * Detect script type from script buffer
   */
  private detectScriptType(script: Buffer): string {
    try {
      const decompiled = bitcoin.script.decompile(script);
      if (!decompiled) return 'unknown';

      // OP_RETURN
      if (decompiled[0] === bitcoin.opcodes.OP_RETURN) {
        return 'op_return';
      }

      // P2WSH: OP_0 <32-byte-hash>
      if (
        decompiled.length === 2 &&
        decompiled[0] === bitcoin.opcodes.OP_0 &&
        Buffer.isBuffer(decompiled[1]) &&
        decompiled[1].length === 32
      ) {
        return 'v0_p2wsh';
      }

      // P2WPKH: OP_0 <20-byte-hash>
      if (
        decompiled.length === 2 &&
        decompiled[0] === bitcoin.opcodes.OP_0 &&
        Buffer.isBuffer(decompiled[1]) &&
        decompiled[1].length === 20
      ) {
        return 'v0_p2wpkh';
      }

      // P2PKH
      if (
        decompiled.length === 5 &&
        decompiled[0] === bitcoin.opcodes.OP_DUP &&
        decompiled[1] === bitcoin.opcodes.OP_HASH160
      ) {
        return 'p2pkh';
      }

      // P2SH
      if (
        decompiled.length === 3 &&
        decompiled[0] === bitcoin.opcodes.OP_HASH160 &&
        Buffer.isBuffer(decompiled[1]) &&
        decompiled[1].length === 20
      ) {
        return 'p2sh';
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Check if script is OP_RETURN
   */
  private isOpReturn(script: Buffer): boolean {
    try {
      const decompiled = bitcoin.script.decompile(script);
      return decompiled !== null && decompiled[0] === bitcoin.opcodes.OP_RETURN;
    } catch {
      return false;
    }
  }

  /**
   * Check if script is P2WSH
   */
  private isP2WSH(script: Buffer): boolean {
    try {
      const decompiled = bitcoin.script.decompile(script);
      return (
        decompiled !== null &&
        decompiled.length === 2 &&
        decompiled[0] === bitcoin.opcodes.OP_0 &&
        Buffer.isBuffer(decompiled[1]) &&
        decompiled[1].length === 32
      );
    } catch {
      return false;
    }
  }

  /**
   * Decode OP_RETURN data
   */
  private decodeOpReturn(script: Buffer): any {
    try {
      const decompiled = bitcoin.script.decompile(script);
      if (!decompiled || decompiled[0] !== bitcoin.opcodes.OP_RETURN) {
        return null;
      }

      const data = decompiled[1];
      if (!Buffer.isBuffer(data)) {
        return null;
      }

      // Return raw data - will be decoded by extractCounterpartyData
      return {
        type: 'raw',
        hex: data.toString('hex'),
        size: data.length,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract and decode Counterparty data (for Bitcoin Stamps)
   */
  private extractCounterpartyData(
    outputs: DecodedOutput[],
    txid: string,
  ): CounterpartyDetails {
    const opReturnOutput = outputs.find((o) => o.isOpReturn);

    if (!opReturnOutput || !opReturnOutput.decodedData) {
      return { found: false, isEncrypted: false };
    }

    const data = opReturnOutput.decodedData;
    if (data.type !== 'raw' || !data.hex) {
      return { found: false, isEncrypted: false };
    }

    try {
      // Try to decode as encrypted Counterparty message
      const decoded = decodeCounterpartyTx(data.hex, txid);

      if (decoded.valid && decoded.prefix === 'CNTRPRTY') {
        // It's a valid Counterparty message
        const details: CounterpartyDetails = {
          found: true,
          isEncrypted: true,
          prefix: decoded.prefix,
          messageType: decoded.msg_id,
          messageTypeName: this.getCounterpartyMessageTypeName(decoded.msg_id),
          encodedData: data.hex,
        };

        // For stamps, we expect message type 22 (issuance with description)
        if (decoded.msg_id === 22) {
          // Try to extract STAMP: from the encrypted data
          // Note: Full decoding would require parsing the message structure
          details.description = 'STAMP:[encrypted]';
        }

        return details;
      }

      // Check if it's unencrypted CNTRPRTY (shouldn't happen in production)
      const hexBuffer = Buffer.from(data.hex, 'hex');
      if (
        hexBuffer.length >= 8 &&
        hexBuffer.subarray(0, 8).toString('utf8') === 'CNTRPRTY'
      ) {
        return {
          found: true,
          isEncrypted: false,
          prefix: 'CNTRPRTY',
          messageType: hexBuffer[8],
          messageTypeName: this.getCounterpartyMessageTypeName(hexBuffer[8] ?? 0),
          encodedData: data.hex,
        };
      }

      return { found: false, isEncrypted: false };
    } catch (error) {
      console.error('Error decoding Counterparty data:', error);
      return { found: false, isEncrypted: false };
    }
  }

  /**
   * Extract and decode SRC-20 data from P2WSH outputs
   */
  private async extractSRC20Data(
    outputs: DecodedOutput[],
  ): Promise<SRC20Details> {
    // SRC-20 uses P2WSH outputs WITHOUT OP_RETURN
    const p2wshOutputs = outputs.filter((o) => o.isP2WSH);

    if (p2wshOutputs.length === 0) {
      return { found: false };
    }

    // Check if there's an OP_RETURN (if yes, it's likely a stamp, not SRC-20)
    const hasOpReturn = outputs.some((o) => o.isOpReturn);
    if (hasOpReturn) {
      // Could still be SRC-20 mixed with other data, but less likely
      // Continue checking...
    }

    try {
      // Extract P2WSH addresses for the response
      const p2wshAddresses = p2wshOutputs
        .map((o) => o.address)
        .filter((addr): addr is string => addr !== undefined);

      // Convert outputs to the format expected by the encoder's decode method
      const p2wshOutputsForDecoding = p2wshOutputs.map((output) => ({
        script: Buffer.from(output.script, 'hex'),
        value: output.value,
      }));

      if (p2wshOutputsForDecoding.length === 0) {
        return { found: false };
      }

      // Use the SRC20Encoder's decode method which handles compression correctly
      const decodedData = await this.src20Encoder.decodeFromOutputs(
        p2wshOutputsForDecoding,
      );

      if (!decodedData) {
        return { found: false };
      }

      // Create details object from the decoded data
      const details: SRC20Details = {
        found: true,
        protocol: decodedData.p,
        operation: decodedData.op,
        tick: decodedData.tick,
        jsonData: JSON.stringify(decodedData),
        p2wshAddresses,
      };

      // Add operation-specific fields
      switch (decodedData.op) {
        case 'DEPLOY': {
          const deployData = decodedData as any;
          details.max = deployData.max;
          details.lim = deployData.lim;
          details.dec = deployData.dec;
          break;
        }
        case 'MINT':
        case 'TRANSFER': {
          const transferData = decodedData as any;
          details.amount = transferData.amt;
          break;
        }
      }

      // Add any metadata fields
      const metaData = decodedData as any;
      if (metaData.description || metaData.img || metaData.icon) {
        details.metadata = {
          description: metaData.description,
          img: metaData.img,
          icon: metaData.icon,
          web: metaData.web,
          email: metaData.email,
          tg: metaData.tg,
        };
      }

      return details;
    } catch {
      // Error decoding, not SRC-20
      return { found: false };
    }
  }

  /**
   * Get Counterparty message type name
   */
  private getCounterpartyMessageTypeName(type: number): string {
    const types: Record<number, string> = {
      0: 'SEND',
      10: 'ORDER',
      11: 'BTCPAY',
      20: 'ISSUANCE',
      21: 'ISSUANCE_EXTENDED',
      22: 'ISSUANCE_WITH_DESCRIPTION',
      30: 'BROADCAST',
      40: 'BET',
      50: 'DIVIDEND',
      60: 'BURN',
      70: 'CANCEL',
      80: 'RPS',
      90: 'RPSRESOLVE',
      100: 'PUBLISH',
      110: 'EXECUTE',
      120: 'DESTROY',
    };
    return types[type] || `UNKNOWN_${type}`;
  }

  /**
   * Analyze stamp/SRC-20 structure in transaction
   */
  private analyzeStampStructure(
    outputs: DecodedOutput[],
    counterparty: CounterpartyDetails,
    src20: SRC20Details,
  ): StampDetails {
    const opReturnIndices = outputs.filter((o) => o.isOpReturn).map((o) => o.index);

    const p2wshOutputs = outputs.filter((o) => o.isP2WSH);
    const p2wshIndices = p2wshOutputs.map((o) => o.index);

    const totalP2WSHValue = p2wshOutputs.reduce((sum, o) => sum + o.value, 0);

    // Determine dust value per output
    let dustValuePerOutput: number | undefined;
    if (p2wshOutputs.length > 0) {
      const uniqueValues = [...new Set(p2wshOutputs.map((o) => o.value))];
      if (uniqueValues.length === 1) {
        dustValuePerOutput = uniqueValues[0];
      }
    }

    // Check if this looks like a stamp transaction
    const hasStampStructure = counterparty.found &&
      p2wshOutputs.length > 0 &&
      (dustValuePerOutput === 330 || dustValuePerOutput === 546);

    // Estimate data size based on P2WSH output count
    // Each P2WSH can hold ~32 bytes of actual data
    const estimatedDataSize = p2wshOutputs.length * 32;

    // Try to extract P2WSH data if it's SRC-20
    let P2WSHData: string | undefined;
    if (src20.found && src20.jsonData) {
      P2WSHData = 'stamp:' + src20.jsonData;
    }

    return {
      hasStampStructure,
      opReturnIndex: opReturnIndices[0],
      p2wshOutputCount: p2wshOutputs.length,
      p2wshOutputIndices: p2wshIndices,
      totalP2WSHValue,
      dustValuePerOutput,
      estimatedDataSize,
      P2WSHData,
    };
  }

  /**
   * Create transaction summary
   */
  private createSummary(
    inputs: DecodedInput[],
    outputs: DecodedOutput[],
    stampData: StampDetails,
    src20Data: SRC20Details,
    transactionType: 'stamp' | 'src20' | 'both' | 'unknown',
  ): TransactionSummary {
    const totalInputValue = inputs.reduce((sum, i) => sum + (i.value ?? 0), 0);
    const totalOutputValue = outputs.reduce((sum, o) => sum + o.value, 0);
    const opReturnOutputs = outputs.filter((o) => o.isOpReturn);
    const p2wshOutputs = outputs.filter((o) => o.isP2WSH);

    return {
      inputCount: inputs.length,
      outputCount: outputs.length,
      totalInputValue: totalInputValue > 0 ? totalInputValue : undefined,
      totalOutputValue,
      fee: totalInputValue > 0 ? totalInputValue - totalOutputValue : undefined,
      hasOpReturn: opReturnOutputs.length > 0,
      opReturnCount: opReturnOutputs.length,
      p2wshCount: p2wshOutputs.length,
      isLikelyStamp: stampData.hasStampStructure,
      isLikelySRC20: src20Data.found,
      transactionType,
    };
  }

  /**
   * Format decoded transaction for display
   */
  formatForDisplay(decoded: DecodedTransaction): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push(`Transaction: ${decoded.txid}`);
    lines.push('='.repeat(80));

    // Transaction Type
    lines.push(
      `\n🏷️  Transaction Type: ${decoded.transactionType.toUpperCase()}`,
    );

    // Summary
    lines.push('\n📊 Summary:');
    lines.push(`  Version: ${decoded.version}`);
    lines.push(`  Locktime: ${decoded.locktime}`);
    lines.push(`  Inputs: ${decoded.summary.inputCount}`);
    lines.push(`  Outputs: ${decoded.summary.outputCount}`);
    if (decoded.summary.totalInputValue) {
      lines.push(`  Total Input: ${decoded.summary.totalInputValue} sats`);
    }
    lines.push(`  Total Output: ${decoded.summary.totalOutputValue} sats`);
    if (decoded.summary.fee) {
      lines.push(
        `  Fee: ${decoded.summary.fee} sats (${
          ((decoded.summary.fee / decoded.summary.totalOutputValue) * 100)
            .toFixed(2)
        }%)`,
      );
    }

    // Inputs
    lines.push('\n📥 Inputs:');
    decoded.inputs.forEach((input) => {
      lines.push(
        `  [${input.index}] ${input.previousTxid}:${input.previousVout}`,
      );
      if (input.address) {
        lines.push(`      Address: ${input.address}`);
      }
      if (input.type) {
        lines.push(`      Type: ${input.type}`);
      }
      if (input.value) {
        lines.push(`      Value: ${input.value} sats`);
      }
    });

    // Outputs
    lines.push('\n📤 Outputs:');
    decoded.outputs.forEach((output) => {
      const markers = [];
      if (output.isOpReturn) markers.push('OP_RETURN');
      if (output.isP2WSH) markers.push('P2WSH');

      lines.push(
        `  [${output.index}] ${output.value} sats - ${output.scriptType} ${
          markers.length > 0 ? `(${markers.join(', ')})` : ''
        }`,
      );

      if (output.address) {
        lines.push(`      Address: ${output.address}`);
      }
    });

    // Counterparty Details (Bitcoin Stamps)
    if (decoded.counterpartyData?.found) {
      lines.push('\n🔐 Counterparty Protocol (Bitcoin Stamp):');
      lines.push(`  Found: ✅`);
      lines.push(
        `  Encrypted: ${decoded.counterpartyData.isEncrypted ? '✅' : '❌'}`,
      );
      if (decoded.counterpartyData.prefix) {
        lines.push(`  Prefix: ${decoded.counterpartyData.prefix}`);
      }
      if (decoded.counterpartyData.messageTypeName) {
        lines.push(
          `  Message Type: ${decoded.counterpartyData.messageTypeName} (${decoded.counterpartyData.messageType})`,
        );
      }
      if (decoded.counterpartyData.assetName) {
        lines.push(`  Asset Name: ${decoded.counterpartyData.assetName}`);
      }
      if (decoded.counterpartyData.supply) {
        lines.push(`  Supply: ${decoded.counterpartyData.supply}`);
      }
      if (decoded.counterpartyData.description) {
        lines.push(`  Description: ${decoded.counterpartyData.description}`);
      }
      if (decoded.counterpartyData.stampFilename) {
        lines.push(
          `  Stamp Filename: ${decoded.counterpartyData.stampFilename}`,
        );
      }
    }

    // SRC-20 Details
    if (decoded.src20Data?.found) {
      lines.push('\n💰 SRC-20 Token Data:');
      lines.push(`  Found: ✅`);
      lines.push(`  Protocol: ${decoded.src20Data.protocol}`);
      lines.push(`  Operation: ${decoded.src20Data.operation}`);
      lines.push(`  Tick: ${decoded.src20Data.tick}`);

      if (decoded.src20Data.operation === 'DEPLOY') {
        lines.push(`  Max Supply: ${decoded.src20Data.max}`);
        lines.push(`  Limit: ${decoded.src20Data.lim}`);
        if (decoded.src20Data.dec !== undefined) {
          lines.push(`  Decimals: ${decoded.src20Data.dec}`);
        }
      } else if (decoded.src20Data.amount) {
        lines.push(`  Amount: ${decoded.src20Data.amount}`);
      }

      if (decoded.src20Data.metadata) {
        lines.push(`  Metadata:`);
        Object.entries(decoded.src20Data.metadata).forEach(([key, value]) => {
          if (value) {
            lines.push(`    ${key}: ${value}`);
          }
        });
      }

      lines.push(
        `  P2WSH Addresses: ${decoded.src20Data.p2wshAddresses?.length || 0}`,
      );
    }

    // Stamp/P2WSH Structure
    if (decoded.stampData?.hasStampStructure || decoded.src20Data?.found) {
      lines.push('\n🖼️  Data Structure:');

      if (decoded.stampData?.hasStampStructure) {
        lines.push(`  Bitcoin Stamp Structure: ✅`);
        lines.push(`  OP_RETURN at index: ${decoded.stampData.opReturnIndex}`);
      } else if (decoded.src20Data?.found) {
        lines.push(`  SRC-20 Structure: ✅ (no OP_RETURN)`);
      }

      lines.push(
        `  P2WSH Outputs: ${decoded.stampData?.p2wshOutputCount || 0}`,
      );
      if (
        decoded.stampData?.p2wshOutputIndices &&
        decoded.stampData.p2wshOutputIndices.length > 0
      ) {
        lines.push(
          `  P2WSH Indices: [${decoded.stampData.p2wshOutputIndices.join(', ')}]`,
        );
      }
      lines.push(
        `  Total P2WSH Value: ${decoded.stampData?.totalP2WSHValue || 0} sats`,
      );

      if (decoded.stampData?.dustValuePerOutput) {
        lines.push(
          `  Dust per Output: ${decoded.stampData.dustValuePerOutput} sats`,
        );
        if (decoded.stampData.dustValuePerOutput === 330) {
          lines.push(`    → Standard Bitcoin Stamp dust value`);
        } else if (decoded.stampData.dustValuePerOutput === 546) {
          lines.push(`    → Standard minimum dust value`);
        }
      }

      if (decoded.stampData?.estimatedDataSize) {
        lines.push(
          `  Estimated Data Size: ~${decoded.stampData.estimatedDataSize} bytes`,
        );
      }
    }

    lines.push('\n' + '='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Compare two transactions to validate they match
   */
  compareTransactions(
    tx1: DecodedTransaction,
    tx2: DecodedTransaction,
  ): {
    match: boolean;
    differences: string[];
  } {
    const differences: string[] = [];

    // Compare transaction types
    if (tx1.transactionType !== tx2.transactionType) {
      differences.push(
        `Transaction type: ${tx1.transactionType} vs ${tx2.transactionType}`,
      );
    }

    // Compare output counts
    if (tx1.outputs.length !== tx2.outputs.length) {
      differences.push(
        `Output count: ${tx1.outputs.length} vs ${tx2.outputs.length}`,
      );
    }

    // Compare OP_RETURN presence
    const tx1OpReturn = tx1.outputs.filter((o) => o.isOpReturn).length;
    const tx2OpReturn = tx2.outputs.filter((o) => o.isOpReturn).length;
    if (tx1OpReturn !== tx2OpReturn) {
      differences.push(`OP_RETURN outputs: ${tx1OpReturn} vs ${tx2OpReturn}`);
    }

    // Compare P2WSH outputs
    const tx1P2WSH = tx1.outputs.filter((o) => o.isP2WSH).length;
    const tx2P2WSH = tx2.outputs.filter((o) => o.isP2WSH).length;
    if (tx1P2WSH !== tx2P2WSH) {
      differences.push(`P2WSH outputs: ${tx1P2WSH} vs ${tx2P2WSH}`);
    }

    // Compare dust values
    if (
      tx1.stampData?.dustValuePerOutput !== tx2.stampData?.dustValuePerOutput
    ) {
      differences.push(
        `Dust value: ${tx1.stampData?.dustValuePerOutput} vs ${tx2.stampData?.dustValuePerOutput}`,
      );
    }

    // Compare Counterparty data
    if (tx1.counterpartyData?.found !== tx2.counterpartyData?.found) {
      differences.push(
        `Counterparty found: ${tx1.counterpartyData?.found} vs ${tx2.counterpartyData?.found}`,
      );
    }

    // Compare SRC-20 data
    if (tx1.src20Data?.found !== tx2.src20Data?.found) {
      differences.push(
        `SRC-20 found: ${tx1.src20Data?.found} vs ${tx2.src20Data?.found}`,
      );
    }

    return {
      match: differences.length === 0,
      differences,
    };
  }
}

/**
 * Command-line interface for decoding transactions
 */
export async function decodeTransaction(
  txHash: string,
  network?: string,
): Promise<void> {
  const bitcoinNetwork = network === 'testnet'
    ? bitcoin.networks.testnet
    : bitcoin.networks.bitcoin;

  const apiUrl = network === 'testnet'
    ? 'https://mempool.space/testnet/api'
    : 'https://mempool.space/api';

  const decoder = new TransactionDecoder(bitcoinNetwork, apiUrl);

  try {
    console.log(`\n🔍 Decoding transaction: ${txHash}\n`);

    const decoded = await decoder.decodeByTxHash(txHash);
    const formatted = decoder.formatForDisplay(decoded);

    console.log(formatted);

    // Save to file
    const filename = `decoded_${txHash.substring(0, 8)}.json`;
    const fs = await import('fs');
    fs.writeFileSync(filename, JSON.stringify(decoded, null, 2));
    console.log(`\n💾 Full decoded data saved to: ${filename}`);
  } catch (error: any) {
    console.error(`\n❌ Error decoding transaction: ${error.message}`);
    process.exit(1);
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node transaction-decoder.js <txhash> [network]');
    console.log('\nExamples:');
    console.log(
      '  Bitcoin Stamp: node transaction-decoder.js 34731ff5df3fe573bf49a772d284f68ec2449e54fc2b4f068e019b67b6d98d39',
    );
    console.log('  SRC-20 Token: node transaction-decoder.js <src20-txhash>');
    console.log('  Testnet: node transaction-decoder.js <txhash> testnet');
    process.exit(1);
  }

  const txHash = args[0];
  const network = args[1];

  if (!txHash) {
    console.error('Transaction hash is required');
    process.exit(1);
  }

  decodeTransaction(txHash, network);
}
