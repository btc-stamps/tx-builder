/**
 * @module Encoders
 * @description Data encoding implementations for embedding arbitrary data into Bitcoin transactions.
 * This module provides specialized encoders for Bitcoin Stamps, SRC-20 tokens, and Counterparty protocol
 * data, with support for various encoding methods including P2WSH witness script embedding and
 * OP_RETURN data embedding.
 *
 * Supported Encoding Methods:
 * - **P2WSH Encoder**: Embeds data in witness scripts using Pay-to-Witness-Script-Hash
 * - **Bitcoin Stamps Encoder**: Complete Bitcoin Stamps protocol implementation
 * - **SRC-20 Encoder**: SRC-20 token protocol encoding with Counterparty integration
 * - **Counterparty Encoder**: Raw Counterparty protocol data encoding
 *
 * Features:
 * - Multi-output data splitting for large payloads
 * - Automatic data compression and optimization
 * - Transaction size limit enforcement (100KB max)
 * - Multi-format support (PNG, GIF, JPEG, WEBP)
 * - Metadata handling and validation
 * - RC4 encryption for Counterparty data
 *
 * @example Basic P2WSH data embedding
 * ```typescript
 * import { P2WSHEncoder } from '@btc-stamps/tx-builder/encoders';
 *
 * const encoder = new P2WSHEncoder();
 * const result = await encoder.encode({
 *   data: Buffer.from('Hello, Bitcoin!', 'utf8'),
 *   maxOutputs: 10
 * });
 *
 * console.log(`Created ${result.outputs.length} outputs`);
 * console.log(`Total size: ${result.totalSize} bytes`);
 * ```
 *
 * @example Bitcoin Stamps creation
 * ```typescript
 * import { BitcoinStampsEncoder } from '@btc-stamps/tx-builder/encoders';
 * import { readFileSync } from 'fs';
 *
 * const encoder = new BitcoinStampsEncoder();
 * const imageData = readFileSync('stamp.png');
 *
 * const result = await encoder.encode({
 *   data: imageData,
 *   mimeType: 'image/png',
 *   filename: 'my-stamp.png',
 *   metadata: {
 *     title: 'My Bitcoin Stamp',
 *     description: 'A unique digital artifact',
 *     creator: 'Artist Name'
 *   }
 * });
 *
 * // result.outputs contains P2WSH outputs for the image data
 * // result.opReturnOutput contains Counterparty reference
 * ```
 *
 * @example SRC-20 token operations
 * ```typescript
 * import { SRC20Encoder } from '@btc-stamps/tx-builder/encoders';
 *
 * const encoder = new SRC20Encoder();
 *
 * // Deploy a new SRC-20 token
 * const deployResult = await encoder.encode({
 *   operation: 'DEPLOY',
 *   tick: 'MYTOKEN',
 *   max: '21000000',
 *   lim: '1000'
 * });
 *
 * // Mint tokens
 * const mintResult = await encoder.encode({
 *   operation: 'MINT',
 *   tick: 'MYTOKEN',
 *   amt: '1000'
 * });
 *
 * // Transfer tokens
 * const transferResult = await encoder.encode({
 *   operation: 'TRANSFER',
 *   tick: 'MYTOKEN',
 *   amt: '500'
 * });
 * ```
 *
 * @example Advanced encoding with options
 * ```typescript
 * import { BitcoinStampsEncoder } from '@btc-stamps/tx-builder/encoders';
 *
 * const encoder = new BitcoinStampsEncoder();
 * const result = await encoder.encode({
 *   data: imageBuffer,
 *   mimeType: 'image/gif',
 *   filename: 'animated.gif',
 *   options: {
 *     compressionLevel: 9,
 *     maxOutputs: 50,
 *     enforceLimit: true,
 *     customPrefix: 'CUSTOM:'
 *   }
 * });
 *
 * if (result.success) {
 *   console.log(`Encoded successfully: ${result.outputs.length} outputs`);
 * } else {
 *   console.error(`Encoding failed: ${result.error}`);
 * }
 * ```
 */

export * from './p2wsh-encoder.ts';
export * from './bitcoin-stamps-encoder.ts';
export * from './src20-encoder.ts';
export * from './counterparty-encoder.ts';
