/**
 * Counterparty Protocol Encoder
 *
 * Implements proper Counterparty protocol encoding for Bitcoin Stamps
 * Based on JPJA's implementation from Electrum-Counterparty
 *
 * References:
 * - https://github.com/Jpja/Electrum-Counterparty/blob/ad237f654fd7ec2821341a753aa698898664a5a8/olga_stamp.html
 * - https://github.com/Jpja/Electrum-Counterparty/blob/ad237f654fd7ec2821341a753aa698898664a5a8/cip33_issuance.html
 * - https://counterparty.io/docs/protocol_specification/
 */

import { Buffer } from 'node:buffer';

import * as bitcoin from 'bitcoinjs-lib';

/**
 * Counterparty Protocol Constants
 */
export const COUNTERPARTY_CONSTANTS = {
  PREFIX: 'CNTRPRTY',
  PREFIX_HEX: '434e545250525459',

  // Message Type IDs
  MSG_SEND: 0,
  MSG_ORDER: 10,
  MSG_BTCPAY: 11,
  MSG_ISSUANCE: 20,
  MSG_ISSUANCE_EXTENDED: 21,
  MSG_ISSUANCE_WITH_DESCRIPTION: 22,
  MSG_BROADCAST: 30,
  MSG_BET: 40,
  MSG_DIVIDEND: 50,
  MSG_BURN: 60,
  MSG_CANCEL: 70,

  // Asset Name Encoding
  SUBASSET_DIGITS: 'abcdefghijklmnopqrstuvwxyz',
  B26_DIGITS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',

  // Limits
  MAX_ASSET_NAME_LENGTH: 13,
  MIN_NUMERIC_ASSET_ID: 95428956661682177, // 26^12 + 1 (calculated value)
  MAX_NUMERIC_ASSET_ID: 18446744073709551615n, // 2^64 - 1 (maximum uint64)

  // Stamp Specific
  STAMP_PREFIX: 'STAMP:',
  DEFAULT_DIVISIBILITY: 0,
  DEFAULT_LOCKED: true,
};

/**
 * RC4 Encryption Implementation
 * Pure JavaScript implementation since crypto.createCipheriv('rc4') is deprecated
 */
export class RC4 {
  /**
   * RC4 algorithm implementation
   */
  static rc4(key: Buffer, data: Buffer): Buffer {
    // Initialize S-box
    const S: number[] = new Array(256);
    for (let i = 0; i < 256; i++) {
      S[i] = i;
    }

    // Key scheduling algorithm (KSA)
    let j = 0;
    for (let i = 0; i < 256; i++) {
      const keyByte = key[i % key.length] ?? 0;
      j = (j + S[i]! + keyByte) % 256;
      // Swap S[i] and S[j]
      const temp = S[i]!;
      S[i] = S[j]!;
      S[j] = temp;
    }

    // Pseudo-random generation algorithm (PRGA)
    const result = Buffer.alloc(data.length);
    let i = 0;
    j = 0;

    for (let k = 0; k < data.length; k++) {
      i = (i + 1) % 256;
      j = (j + S[i]!) % 256;

      // Swap S[i] and S[j]
      const temp = S[i]!;
      S[i] = S[j]!;
      S[j] = temp;

      const keystream = S[(S[i]! + S[j]!) % 256]!;
      result[k] = data[k]! ^ keystream;
    }

    return result;
  }

  /**
   * RC4 encrypt/decrypt (symmetric)
   */
  static encrypt(key: Buffer, data: Buffer): Buffer {
    return this.rc4(key, data);
  }

  /**
   * RC4 encrypt hex string using hex key
   */
  static encryptHex(keyHex: string, dataHex: string): string {
    // Convert hex to binary strings (like reference implementation)
    const keyBinary = this.hex2bin(keyHex);
    const dataBinary = this.hex2bin(dataHex);

    // RC4 encrypt using binary strings
    const encryptedBinary = this.rc4Binary(keyBinary, dataBinary);

    // Convert back to hex
    return this.bin2hex(encryptedBinary);
  }

  /**
   * Convert hex string to binary string (matches JavaScript reference)
   */
  private static hex2bin(hex: string): string {
    const bytes: number[] = [];
    for (let i = 0; i < hex.length - 1; i += 2) {
      const ch = parseInt(hex.substr(i, 2), 16);
      bytes.push(ch);
    }
    return String.fromCharCode.apply(String, bytes);
  }

  /**
   * Convert binary string to hex (matches JavaScript reference)
   */
  private static bin2hex(s: string): string {
    let o = '';
    for (let i = 0, l = s.length; i < l; i++) {
      const n = s.charCodeAt(i).toString(16);
      o += n.length < 2 ? '0' + n : n;
    }
    return o;
  }

  /**
   * RC4 algorithm using binary strings (matches JavaScript reference exactly)
   */
  private static rc4Binary(key: string, str: string): string {
    const s: number[] = [];
    let j = 0;
    let x: number;
    let res = '';

    // Initialize S-box
    for (let i = 0; i < 256; i++) {
      s[i] = i;
    }

    // Key scheduling
    for (let i = 0; i < 256; i++) {
      j = (j + s[i]! + key.charCodeAt(i % key.length)) % 256;
      x = s[i]!;
      s[i] = s[j]!;
      s[j] = x;
    }

    // Pseudo-random generation
    let i = 0;
    j = 0;
    for (let y = 0; y < str.length; y++) {
      i = (i + 1) % 256;
      j = (j + s[i]!) % 256;
      x = s[i]!;
      s[i] = s[j]!;
      s[j] = x;
      res += String.fromCharCode(str.charCodeAt(y) ^ s[(s[i]! + s[j]!) % 256]!);
    }
    return res;
  }
}

/**
 * Main Counterparty Encoder class
 * Provides methods for encoding Counterparty protocol messages
 */
export class CounterpartyEncoder {
  /**
   * Encode issuance using modern interface matching Counterparty API exactly
   */
  encodeIssuance(params: {
    assetId: bigint;
    quantity: number;
    divisible: boolean;
    lock: boolean;
    description: string;
    reset?: boolean;
  }): { data: Buffer } | null {
    try {
      // Message Type ID (1 byte) - Use type 22 (LR_ISSUANCE)
      const messageType = Buffer.from([22]);

      // Asset ID (8 bytes, big-endian)
      const assetIdBuffer = Buffer.alloc(8);
      assetIdBuffer.writeBigUInt64BE(params.assetId, 0);

      // Quantity (8 bytes, big-endian)
      const quantityBuffer = Buffer.alloc(8);
      quantityBuffer.writeBigUInt64BE(BigInt(params.quantity), 0);

      // Combine flags into single byte (compact format)
      // Bit 0: divisible, Bit 1: lock, Bit 2: reset
      const flags = (params.divisible ? 0x01 : 0) |
        (params.lock ? 0x02 : 0) |
        ((params.reset ?? false) ? 0x04 : 0);
      const flagsBuffer = Buffer.from([flags]);

      // Description (UTF-8 encoded string)
      const descriptionBuffer = params.description
        ? Buffer.from(params.description, 'utf8')
        : Buffer.alloc(0);

      const data = Buffer.concat([
        messageType, // 1 byte (type 22)
        assetIdBuffer, // 8 bytes
        quantityBuffer, // 8 bytes
        flagsBuffer, // 1 byte (combined flags)
        descriptionBuffer, // variable length
      ]);

      return { data };
    } catch (error) {
      console.error(
        'Failed to encode issuance:',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }
}

/**
 * Asset Name Encoder
 * Handles conversion between asset names and numeric IDs
 */
export class AssetNameEncoder {
  /**
   * Convert asset name to numeric ID
   */
  static nameToId(assetName: string): bigint {
    // Handle numeric asset names (A + digits)
    if (/^A\d+$/.test(assetName)) {
      const numericPart = assetName.substring(1);
      const id = BigInt(numericPart);

      if (
        id < BigInt(COUNTERPARTY_CONSTANTS.MIN_NUMERIC_ASSET_ID) ||
        id > BigInt(COUNTERPARTY_CONSTANTS.MAX_NUMERIC_ASSET_ID)
      ) {
        throw new Error(`Numeric asset ID out of range: ${assetName}`);
      }

      return id;
    }

    // Handle alphabetic asset names (base-26 encoding)
    // Must be all uppercase letters and within length limit
    if (!/^[A-Z]+$/.test(assetName)) {
      throw new Error(
        `Invalid asset name format: "${assetName}". ` +
          `Asset names must be either A-prefixed numeric (e.g., A95428956662000000) ` +
          `or alphabetic (uppercase letters only, max ${COUNTERPARTY_CONSTANTS.MAX_ASSET_NAME_LENGTH} characters).`,
      );
    }

    if (assetName.length > COUNTERPARTY_CONSTANTS.MAX_ASSET_NAME_LENGTH) {
      throw new Error(
        `Asset name "${assetName}" exceeds maximum length of ${COUNTERPARTY_CONSTANTS.MAX_ASSET_NAME_LENGTH} characters.`,
      );
    }

    // Warn about alphabetic (named) assets requiring XCP burn
    if (/^[B-Z]/.test(assetName)) {
      console.warn(
        `Warning: Named asset "${assetName}" requires burning 0.5 XCP tokens. ` +
          `Consider using A-prefixed numeric assets for Bitcoin Stamps to avoid XCP burn requirement.`,
      );
    }

    let id = BigInt(0);
    const base = BigInt(26);

    for (let i = 0; i < assetName.length; i++) {
      const char = assetName.charAt(i);
      const value = BigInt(COUNTERPARTY_CONSTANTS.B26_DIGITS.indexOf(char));
      id = id * base + value;
    }

    // Add base offset for alphabetic names
    id = id + BigInt(COUNTERPARTY_CONSTANTS.MIN_NUMERIC_ASSET_ID);

    return id;
  }

  /**
   * Encode asset ID as 8 bytes (big-endian)
   */
  static encodeAssetId(assetName: string): Buffer {
    const id = this.nameToId(assetName);
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(id, 0);
    return buffer;
  }
}

/**
 * Counterparty Message Encoder
 */
export class CounterpartyMessageEncoder {
  /**
   * Encrypt message data (can be mocked for testing)
   */
  private encryptData(message: Buffer, txid: string): Buffer {
    return CounterpartyMessageEncoder.encryptMessage(message, txid);
  }

  /**
   * Encode data into Counterparty OP_RETURN format
   */
  async encode(data: any): Promise<
    {
      script: Buffer;
      value: number;
      isEncrypted: boolean;
      protocolVersion?: string;
      messageType?: string;
      compressionUsed?: boolean;
      originalSize?: number;
      compressedSize?: number;
    } | null
  > {
    try {
      // Validate input
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid input data');
      }

      // Handle circular references
      try {
        JSON.stringify(data);
      } catch (error: any) {
        throw new Error(`Invalid JSON data: circular reference detected: ${error.message}`);
      }

      // Convert to JSON
      const jsonString = JSON.stringify(data);
      const originalSize = jsonString.length;

      // Validate asset names first
      if (data.asset === '') {
        throw new Error('Invalid asset: empty asset name');
      }

      // Check for required fields based on operation type
      if (data.op === 'send') {
        if (!data.asset || !data.quantity) {
          throw new Error(
            'Missing required fields: asset and quantity are required for send operations',
          );
        }
        if (!data.asset.trim()) {
          throw new Error('Invalid asset: empty asset name');
        }
      }

      // Check size limits
      if (jsonString.length > 1000) {
        throw new Error('Data too large: size limit exceeded');
      }

      // Try compression for larger data
      let finalData = Buffer.from(jsonString, 'utf8');
      let compressionUsed = false;

      if (jsonString.length > 50) {
        try {
          const zlib = await import('node:zlib');
          const compressed = zlib.deflateSync(Buffer.from(jsonString, 'utf8'));
          if (compressed.length < finalData.length) {
            finalData = Buffer.from(compressed);
            compressionUsed = true;
          }
        } catch {
          // Compression failed, use original
        }
      }

      // Create fake transaction ID for encryption (in real usage, this would be the actual UTXO txid)
      const fakeTxid = '0000000000000000000000000000000000000000000000000000000000000000';

      // Create issuance message based on data type
      let messageType: string = 'unknown';
      let message: Buffer;

      if (data.op === 'send') {
        messageType = 'send';
        message = CounterpartyMessageEncoder.encodeIssuance(
          data.asset,
          data.quantity || 0,
          false, // divisible
          true, // locked
          false, // reset
        );
      } else if (data.op === 'issuance') {
        messageType = 'issuance';
        message = CounterpartyMessageEncoder.encodeIssuanceWithDescription(
          data.asset,
          data.quantity || 0,
          data.description || '',
          data.divisible || false,
          true, // locked
          false, // reset
        );
      } else {
        // Generic message
        messageType = 'generic';
        message = Buffer.concat([
          Buffer.from([0x00]), // Generic message type
          finalData,
        ]);
      }

      // Add CNTRPRTY prefix
      const fullMessage = CounterpartyMessageEncoder.createMessage(message);

      // Encrypt with RC4
      const encrypted = this.encryptData(fullMessage, fakeTxid);

      // Create OP_RETURN script
      if (encrypted.length > 78) {
        throw new Error('Encrypted data too large for OP_RETURN');
      }

      const script = Buffer.concat([
        Buffer.from([0x6a]), // OP_RETURN
        Buffer.from([encrypted.length]), // Push length
        encrypted,
      ]);

      return {
        script,
        value: 0,
        isEncrypted: true,
        protocolVersion: 'CNTRPRTY',
        messageType,
        compressionUsed,
        originalSize,
        compressedSize: compressionUsed ? finalData.length : undefined,
      };
    } catch (error) {
      console.error('Failed to encode:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }
  /**
   * Create issuance message (type 20) - Post-2023 format
   * Following the current Counterparty protocol format (no callable/call fields)
   */
  static encodeIssuance(
    assetName: string,
    quantity: number,
    divisible: boolean = false,
    locked: boolean = true,
    reset: boolean = false,
  ): Buffer {
    // Message Type ID (1 byte) - Use type 22 (LR_ISSUANCE) as per current standard
    const messageTypeBuffer = Buffer.from([22]);

    // Asset ID (8 bytes, big-endian)
    const assetId = AssetNameEncoder.encodeAssetId(assetName);

    // Quantity (8 bytes, big-endian)
    const quantityBuffer = Buffer.alloc(8);
    quantityBuffer.writeBigUInt64BE(BigInt(quantity), 0);

    // Combine flags into single byte (compact format)
    // Bit 0: divisible, Bit 1: lock, Bit 2: reset
    const flags = (divisible ? 0x01 : 0) | (locked ? 0x02 : 0) | (reset ? 0x04 : 0);
    const flagsBuffer = Buffer.from([flags]);

    return Buffer.concat([
      messageTypeBuffer, // 1 byte (type 22)
      assetId, // 8 bytes
      quantityBuffer, // 8 bytes
      flagsBuffer, // 1 byte (combined flags)
      // Total: 18 bytes (no description)
    ]);
  }

  /**
   * Create enhanced issuance message (type 20 with description) - Post-2023 format
   * Issuance with description (used for STAMP:filename)
   */
  static encodeIssuanceWithDescription(
    assetName: string,
    quantity: number,
    description: string,
    divisible: boolean = false,
    locked: boolean = true,
    reset: boolean = false,
  ): Buffer {
    // Message Type ID (1 byte) - Use type 22 (LR_ISSUANCE) as per current standard
    const messageTypeBuffer = Buffer.from([22]);

    // Asset ID (8 bytes, big-endian)
    const assetId = AssetNameEncoder.encodeAssetId(assetName);

    // Quantity (8 bytes, big-endian)
    const quantityBuffer = Buffer.alloc(8);
    quantityBuffer.writeBigUInt64BE(BigInt(quantity), 0);

    // Combine flags into single byte (compact format)
    // Bit 0: divisible, Bit 1: lock, Bit 2: reset
    const flags = (divisible ? 0x01 : 0) | (locked ? 0x02 : 0) | (reset ? 0x04 : 0);
    const flagsBuffer = Buffer.from([flags]);

    // Description (UTF-8 encoded string, no null terminator)
    const descriptionBuffer = Buffer.from(description, 'utf8');

    return Buffer.concat([
      messageTypeBuffer, // 1 byte (type 22)
      assetId, // 8 bytes
      quantityBuffer, // 8 bytes
      flagsBuffer, // 1 byte (combined flags)
      descriptionBuffer, // variable length
      // Total: 18 + description length bytes
    ]);
  }

  /**
   * Create full Counterparty message with prefix
   */
  static createMessage(payload: Buffer): Buffer {
    const prefix = Buffer.from(COUNTERPARTY_CONSTANTS.PREFIX, 'utf8');
    return Buffer.concat([prefix, payload]);
  }

  /**
   * Encrypt message using RC4 with transaction ID as key
   */
  static encryptMessage(message: Buffer, txid: string): Buffer {
    // Use first 16 bytes of txid as RC4 key
    const key = Buffer.from(txid.substring(0, 32), 'hex');
    return RC4.encrypt(key, message);
  }
}

/**
 * P2WSH Message Issuance
 * Port of P2WSH_msg_issuance from JPJA's implementation
 */
export function P2WSHMsgIssuance(
  assetName: string,
  supply: number,
  description: string,
  flags: string = '000001', // Default: divisible=false, reset=false, locked=true
  assetType: string = 'stamp',
): string {
  // Validate inputs
  if (!assetName || assetName.length === 0) {
    throw new Error('Asset name is required');
  }

  if (supply <= 0) {
    throw new Error('Supply must be positive');
  }

  // Parse flags (format: 'XXYYZZ' where XX=divisible, YY=reset, ZZ=locked)
  const divisible = flags.substring(0, 2) === '01';
  const reset = flags.substring(2, 4) === '01';
  const locked = flags.substring(4, 6) === '01';

  // For stamps, always use non-divisible
  const isDivisible = assetType === 'stamp' ? false : divisible;

  // Create the issuance message (always with description for stamps)
  const message = CounterpartyMessageEncoder.encodeIssuanceWithDescription(
    assetName,
    supply,
    description,
    isDivisible,
    locked,
    reset,
  );

  // Add CNTRPRTY prefix
  const fullMessage = CounterpartyMessageEncoder.createMessage(message);

  return fullMessage.toString('hex');
}

/**
 * RC4 Hex Encryption
 * Port of rc4_hex from JPJA's implementation
 */
export function rc4Hex(key: string, plaintext: string): string {
  return RC4.encryptHex(key, plaintext);
}

/**
 * Decode Transaction
 * Port of decode_tx for validation
 */
export function decodeTx(opreturn: string, txid: string): any {
  try {
    // Decrypt the op_return using txid as key
    const decrypted = rc4Hex(txid, opreturn);
    const decryptedBuffer = Buffer.from(decrypted, 'hex');

    // Check for CNTRPRTY prefix
    const prefix = decryptedBuffer.subarray(0, 8).toString('utf8');

    if (prefix !== COUNTERPARTY_CONSTANTS.PREFIX) {
      return { prefix: 'INVALID', msg_id: -1 };
    }

    // Get message type - try 1-byte first (standard format)
    if (decryptedBuffer.length < 9) {
      return { prefix: 'INVALID', msg_id: -1, error: 'Message too short' };
    }

    const msgId = decryptedBuffer[8]; // 1-byte message type

    return {
      prefix: COUNTERPARTY_CONSTANTS.PREFIX,
      msg_id: msgId,
      valid: true,
    };
  } catch (error) {
    return {
      prefix: 'ERROR',
      msg_id: -1,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Main Counterparty Issuance Builder
 * Following JPJA's prepareOpReturn flow
 */
export class CounterpartyIssuanceBuilder {
  /**
   * Prepare OP_RETURN for stamp issuance
   * Based on JPJA's prepareOpReturn function
   */
  static prepareOpReturn(
    selectedUtxos: Array<{ txid: string; vout: number; value: number }>,
    assetName: string,
    supply: number,
    filename?: string,
    isLocked: boolean = true,
    assetType: string = 'stamp',
    numberOfMints: number = 1,
  ): Array<{ opreturn: string; opreturnUnencoded: string }> {
    if (!selectedUtxos || selectedUtxos.length === 0) {
      throw new Error('At least one UTXO is required');
    }

    const inpUtxo = selectedUtxos[0]!.txid;
    const opReturnArray: Array<
      { opreturn: string; opreturnUnencoded: string }
    > = [];

    for (let i = 0; i < numberOfMints; i++) {
      // Build description with STAMP: prefix
      const descriptionText = filename ? `STAMP:${filename}` : 'STAMP:';

      console.log('Building Counterparty issuance:');
      console.log('  Asset name:', assetName);
      console.log('  Supply:', supply);
      console.log('  Description:', descriptionText);
      console.log('  Locked:', isLocked);
      console.log('  Asset type:', assetType);

      // Create the issuance message
      const opreturnUnencoded = P2WSHMsgIssuance(
        assetName,
        supply,
        descriptionText,
        isLocked ? '000100' : '000000',
        assetType,
      );

      // Encrypt with RC4 using first UTXO txid as key
      const opreturn = rc4Hex(inpUtxo, opreturnUnencoded);

      // Validate opreturn
      if (!opreturn || !/^[0-9a-fA-F]+$/.test(opreturn)) {
        throw new Error('Invalid OP_RETURN data');
      }

      // Validate by decoding
      const info = decodeTx(opreturn, inpUtxo);
      if (
        info.prefix !== COUNTERPARTY_CONSTANTS.PREFIX ||
        (info.msg_id !== COUNTERPARTY_CONSTANTS.MSG_ISSUANCE &&
          info.msg_id !== COUNTERPARTY_CONSTANTS.MSG_ISSUANCE_WITH_DESCRIPTION)
      ) {
        throw new Error('OP_RETURN encoding error');
      }

      opReturnArray.push({
        opreturn,
        opreturnUnencoded,
      });
    }

    return opReturnArray;
  }

  /**
   * Create OP_RETURN output script for Bitcoin transaction
   */
  static createOpReturnOutput(opreturnHex: string): Buffer {
    const data = Buffer.from(opreturnHex, 'hex');

    // Ensure we don't exceed OP_RETURN size limit (80 bytes)
    if (data.length > 80) {
      throw new Error(
        `OP_RETURN data too large: ${data.length} bytes > 80 bytes maximum`,
      );
    }

    // Create OP_RETURN script
    return bitcoin.script.compile([bitcoin.opcodes.OP_RETURN as number, data]);
  }

  /**
   * Build complete stamp issuance with OP_RETURN
   */
  static buildStampIssuance(
    utxos: Array<{ txid: string; vout: number; value: number }>,
    assetName: string,
    supply: number = 1,
    filename?: string,
    options: {
      isLocked?: boolean;
      assetType?: string;
      numberOfMints?: number;
    } = {},
  ): {
    opReturnScript: Buffer;
    opReturnHex: string;
    unencryptedHex: string;
    metadata: {
      assetName: string;
      supply: number;
      description: string;
      locked: boolean;
      messageType: number;
    };
  } {
    const { isLocked = true, assetType = 'stamp', numberOfMints = 1 } = options;

    // Prepare OP_RETURN data
    const opReturnData = this.prepareOpReturn(
      utxos,
      assetName,
      supply,
      filename,
      isLocked,
      assetType,
      numberOfMints,
    );

    if (opReturnData.length === 0) {
      throw new Error('Failed to prepare OP_RETURN data');
    }

    // Use first mint data (for multiple mints, you'd create multiple transactions)
    const { opreturn, opreturnUnencoded } = opReturnData[0]!;

    // Create OP_RETURN script
    const opReturnScript = this.createOpReturnOutput(opreturn);

    // Decode to get message type
    const info = decodeTx(opreturn, utxos[0]!.txid);

    return {
      opReturnScript,
      opReturnHex: opreturn,
      unencryptedHex: opreturnUnencoded,
      metadata: {
        assetName,
        supply,
        description: filename ? `STAMP:${filename}` : 'STAMP:',
        locked: isLocked,
        messageType: info.msg_id,
      },
    };
  }
}

/**
 * Export convenience functions matching JPJA's interface
 */
export { decodeTx as decode_tx, P2WSHMsgIssuance as P2WSH_msg_issuance, rc4Hex as rc4_hex };
