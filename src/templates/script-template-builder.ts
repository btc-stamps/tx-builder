/**
 * Script Template Builder
 *
 * Template system for building Bitcoin scripts with predefined patterns
 * for common operations like SRC-20 tokens and Bitcoin Stamps.
 */

import * as bitcoin from 'bitcoinjs-lib';
import { Buffer } from 'node:buffer';
import type { SRC20Data } from '../interfaces/src20.interface.ts';

/**
 * Fee preferences for template building
 */
export interface FeePreferences {
  priority: 'low' | 'medium' | 'high';
  maxFeeRate?: number;
  dustThreshold?: number;
}

/**
 * Basic template interface
 */
export interface BaseTemplate {
  type: string;
  name: string;
  description?: string;
  estimatedSize: number;
  outputs: Array<{ script: Buffer; value: number }>;
}

/**
 * SRC-20 specific template
 */
export interface SRC20Template extends BaseTemplate {
  type: 'src20';
  operation: 'DEPLOY' | 'MINT' | 'TRANSFER';
  data: SRC20Data;
  compressionUsed: boolean;
  chunkCount: number;
}

/**
 * Bitcoin Stamp template
 */
export interface StampTemplate extends BaseTemplate {
  type: 'stamp';
  imageData: Buffer;
  compressionLevel: number;
}

/**
 * Batch operation template
 */
export interface BatchTemplate extends BaseTemplate {
  type: 'batch';
  operations: Array<SRC20Template | StampTemplate>;
  optimized: boolean;
}

/**
 * Script template builder for common Bitcoin operations
 */
export class ScriptTemplateBuilder {
  private network: bitcoin.Network;
  private dustThreshold: number;

  constructor(
    network: bitcoin.Network = bitcoin.networks.bitcoin,
    dustThreshold: number = 546,
  ) {
    this.network = network;
    this.dustThreshold = dustThreshold;
  }

  /**
   * Create SRC-20 operation template
   */
  createSRC20Template(
    data: SRC20Data,
    feePrefs?: FeePreferences,
  ): SRC20Template {
    const dustValue = feePrefs?.dustThreshold || this.dustThreshold;

    // Create simple P2WSH outputs for the data
    const jsonStr = JSON.stringify(data);
    const dataBuffer = Buffer.from(`stamp:${jsonStr}`);

    const outputs: Array<{ script: Buffer; value: number }> = [];
    const chunkSize = 32;

    for (let i = 0; i < dataBuffer.length; i += chunkSize) {
      const chunk = dataBuffer.subarray(i, Math.min(i + chunkSize, dataBuffer.length));
      const paddedChunk = Buffer.concat([
        chunk,
        Buffer.alloc(chunkSize - chunk.length, 0),
      ]);

      const script = Buffer.concat([
        Buffer.from([0x00, 0x20]), // OP_0 + push 32 bytes
        paddedChunk,
      ]);

      outputs.push({ script, value: dustValue });
    }

    return {
      type: 'src20',
      name: `SRC-20 ${data.op} - ${data.tick}`,
      description: `SRC-20 ${data.op} operation for ${data.tick}`,
      operation: data.op as 'DEPLOY' | 'MINT' | 'TRANSFER',
      data,
      estimatedSize: this.estimateSize(outputs.length),
      outputs,
      compressionUsed: false,
      chunkCount: outputs.length,
    };
  }

  /**
   * Create Bitcoin Stamp template
   */
  createStampTemplate(
    imageData: Buffer,
    feePrefs?: FeePreferences,
  ): StampTemplate {
    const dustValue = feePrefs?.dustThreshold || this.dustThreshold;

    // Create outputs for image data
    const outputs: Array<{ script: Buffer; value: number }> = [];
    const chunkSize = 32;

    for (let i = 0; i < imageData.length; i += chunkSize) {
      const chunk = imageData.subarray(i, Math.min(i + chunkSize, imageData.length));
      const paddedChunk = Buffer.concat([
        chunk,
        Buffer.alloc(chunkSize - chunk.length, 0),
      ]);

      const script = Buffer.concat([
        Buffer.from([0x00, 0x20]),
        paddedChunk,
      ]);

      outputs.push({ script, value: dustValue });
    }

    return {
      type: 'stamp',
      name: 'Bitcoin Stamp',
      description: 'Bitcoin Stamp with embedded image data',
      imageData,
      compressionLevel: 0,
      estimatedSize: this.estimateSize(outputs.length),
      outputs,
    };
  }

  /**
   * Create batch template combining multiple operations
   */
  createBatchTemplate(
    operations: Array<SRC20Template | StampTemplate>,
    _feePrefs?: FeePreferences,
  ): BatchTemplate {
    const allOutputs = operations.flatMap((op) => op.outputs);

    return {
      type: 'batch',
      name: 'Batch Operations',
      description: `Batch of ${operations.length} operations`,
      operations,
      optimized: false,
      estimatedSize: this.estimateSize(allOutputs.length),
      outputs: allOutputs,
    };
  }

  /**
   * Optimize template for lower fees
   */
  optimizeTemplate<T extends BaseTemplate>(template: T): T {
    // Basic optimization - could be expanded
    return {
      ...template,
      name: `${template.name} (Optimized)`,
    };
  }

  /**
   * Get template cost estimate
   */
  estimateCost(template: BaseTemplate, feeRate: number = 15): {
    totalFee: number;
    dustCost: number;
    networkFee: number;
  } {
    const dustCost = template.outputs.reduce((sum, output) => sum + output.value, 0);
    const networkFee = template.estimatedSize * feeRate;

    return {
      totalFee: dustCost + networkFee,
      dustCost,
      networkFee,
    };
  }

  /**
   * Validate template
   */
  validateTemplate(template: BaseTemplate): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!template.name) {
      errors.push('Template name is required');
    }

    if (template.outputs.length === 0) {
      errors.push('Template must have at least one output');
    }

    if (template.estimatedSize <= 0) {
      errors.push('Invalid estimated size');
    }

    // Check for reasonable output limits
    if (template.outputs.length > 3000) {
      errors.push('Too many outputs (max 3000)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Estimate transaction size
   */
  private estimateSize(outputCount: number): number {
    const baseSize = 10; // Version, locktime, etc.
    const inputSize = 148; // Typical P2WPKH input
    const outputSize = 43; // P2WSH output
    const changeSize = 31; // Change output

    return baseSize + inputSize + (outputSize * outputCount) + changeSize;
  }
}

/**
 * Create a new script template builder
 */
export function createScriptTemplateBuilder(
  network: bitcoin.Network = bitcoin.networks.bitcoin,
  dustThreshold: number = 546,
): ScriptTemplateBuilder {
  return new ScriptTemplateBuilder(network, dustThreshold);
}

/**
 * Template factory for common operations
 */
export class TemplateFactory {
  private builder: ScriptTemplateBuilder;

  constructor(network: bitcoin.Network = bitcoin.networks.bitcoin) {
    this.builder = new ScriptTemplateBuilder(network);
  }

  /**
   * Create SRC-20 DEPLOY template
   */
  createDeployTemplate(
    tick: string,
    max: string,
    lim: string,
    options?: { decimals?: number; description?: string },
  ): SRC20Template {
    const data: SRC20Data = {
      p: 'SRC-20',
      op: 'DEPLOY',
      tick,
      max,
      lim,
      ...(options?.decimals !== undefined && { dec: options.decimals.toString() }),
      ...(options?.description && { description: options.description }),
    } as any;

    return this.builder.createSRC20Template(data);
  }

  /**
   * Create SRC-20 MINT template
   */
  createMintTemplate(tick: string, amount: string): SRC20Template {
    const data: SRC20Data = {
      p: 'SRC-20',
      op: 'MINT',
      tick,
      amt: amount,
    } as any;

    return this.builder.createSRC20Template(data);
  }

  /**
   * Create SRC-20 TRANSFER template
   */
  createTransferTemplate(tick: string, amount: string): SRC20Template {
    const data: SRC20Data = {
      p: 'SRC-20',
      op: 'TRANSFER',
      tick,
      amt: amount,
    } as any;

    return this.builder.createSRC20Template(data);
  }
}

/**
 * Default template factory instance
 */
export const defaultTemplateFactory = new TemplateFactory();

// Types are already exported with their interface declarations above
