/**
 * CPFP (Child-Pays-For-Parent) Builder
 * Implementation for creating child transactions that accelerate parent transactions
 */

import { Buffer } from 'node:buffer';

import * as bitcoin from 'bitcoinjs-lib';
import type { Network, Psbt, Transaction } from 'bitcoinjs-lib';

import type {
  CPFPConfig,
  CPFPTransaction,
  ICPFPBuilder,
  PackageInfo,
} from '../interfaces/rbf-cpfp.interface.ts';
import { InsufficientValueError } from '../interfaces/rbf-cpfp.interface.ts';

/**
 * CPFP Builder Implementation
 */
export class CPFPBuilder implements ICPFPBuilder {
  private dustThreshold = 546; // Standard dust threshold

  constructor(_network: Network = bitcoin.networks.bitcoin) {}

  /**
   * Create CPFP child transaction
   */
  createChild(
    parentTxs: Transaction[],
    config: CPFPConfig,
    network: Network,
  ): Promise<CPFPTransaction> {
    // Validate configuration
    this.validateCPFPConfig(config, parentTxs);

    // Calculate parent package metrics
    const parentPackageSize = parentTxs.reduce(
      (sum, tx) => sum + tx.virtualSize(),
      0,
    );
    const parentPackageFee = this.calculateParentPackageFee(
      parentTxs,
      config.parentFeeRates,
    );

    // Calculate available value from parent outputs
    const availableValue = config.parentOutputs.reduce(
      (sum: number, output: { value: number }) => sum + output.value,
      0,
    );

    // Estimate child transaction size
    const childSize = this.estimateChildSize(config.parentOutputs.length, 1);

    // Calculate required child fee for target package rate
    const requiredChildFee = this.calculateRequiredChildFee(
      parentTxs,
      config.targetPackageFeeRate,
      childSize,
    );

    // Calculate output value after fees
    const minOutputValue = config.minOutputValue || this.dustThreshold;
    const outputValue = availableValue - requiredChildFee;

    if (outputValue < minOutputValue) {
      throw new InsufficientValueError(
        config.parentTxids,
        requiredChildFee + minOutputValue,
        availableValue,
      );
    }

    // Create child PSBT
    const psbt = new bitcoin.Psbt({ network });

    // Add inputs from parent outputs
    for (const parentOutput of config.parentOutputs) {
      psbt.addInput({
        hash: parentOutput.txid,
        index: parentOutput.vout,
        witnessUtxo: {
          script: Buffer.from(parentOutput.scriptPubKey, 'hex'),
          value: parentOutput.value,
        },
      });
    }

    // Add output to destination
    psbt.addOutput({
      address: config.destination,
      value: outputValue,
    });

    // Calculate final metrics
    const actualChildSize = this.estimateTransactionSize(psbt);
    const actualChildFee = availableValue - outputValue;
    const childFeeRate = actualChildFee / actualChildSize;

    // Calculate package metrics
    const packageSize = parentPackageSize + actualChildSize;
    const packageFee = parentPackageFee + actualChildFee;
    const packageFeeRate = packageFee / packageSize;

    // Validate package
    const validation = this.validatePackage(parentTxs, psbt);

    const result: CPFPTransaction = {
      psbt,
      parentTxids: config.parentTxids,
      packageSize,
      packageFee,
      packageFeeRate,
      childFee: actualChildFee,
      childSize: actualChildSize,
      childFeeRate,
      valid: validation.valid,
      messages: [...validation.errors, ...validation.warnings],
    };

    return Promise.resolve(result);
  }

  /**
   * Calculate required child fee for target package rate
   */
  calculateRequiredChildFee(
    parentTxs: Transaction[],
    targetPackageFeeRate: number,
    childSize: number,
  ): number {
    const parentPackageSize = parentTxs.reduce(
      (sum, tx) => sum + tx.virtualSize(),
      0,
    );
    const parentPackageFee = parentTxs.reduce(
      (sum, tx) => sum + this.estimateTransactionFee(tx),
      0,
    );

    // Target fee for entire package
    const totalPackageSize = parentPackageSize + childSize;
    const targetTotalFee = Math.ceil(totalPackageSize * targetPackageFeeRate);

    // Required child fee = target total fee - existing parent fees
    const requiredChildFee = Math.max(0, targetTotalFee - parentPackageFee);

    // Ensure child has minimum fee rate of 1 sat/vB
    const minChildFee = Math.ceil(childSize * 1);

    return Math.max(requiredChildFee, minChildFee);
  }

  /**
   * Validate CPFP package
   */
  validatePackage(
    parentTxs: Transaction[],
    childPsbt: Psbt,
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    packageInfo: PackageInfo;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Build package info
    const packageInfo = this.buildPackageInfo(parentTxs, childPsbt);

    try {
      // Validate child spends from parents
      const childInputs = new Set<string>();
      for (let i = 0; i < childPsbt.inputCount; i++) {
        const input = childPsbt.txInputs[i];
        if (input) {
          const inputTxid = Buffer.from(input.hash).reverse().toString('hex');
          childInputs.add(`${inputTxid}:${input.index}`);
        }
      }

      let foundParentConnection = false;
      for (const parentTx of parentTxs) {
        const parentTxid = parentTx.getId();
        for (let vout = 0; vout < parentTx.outs.length; vout++) {
          if (childInputs.has(`${parentTxid}:${vout}`)) {
            foundParentConnection = true;
            break;
          }
        }
        if (foundParentConnection) break;
      }

      if (!foundParentConnection) {
        errors.push(
          'Child transaction does not spend from any parent transaction',
        );
      }

      // Validate package topology
      const circularDeps = this.detectCircularDependencies(packageInfo);
      if (circularDeps.length > 0) {
        errors.push(
          `Circular dependencies detected: ${circularDeps.join(' -> ')}`,
        );
      }

      // Check package size limits
      if (packageInfo.totalSize > 100000) {
        // 100KB limit
        warnings.push(`Large package size: ${packageInfo.totalSize} bytes`);
      }

      // Check effective fee rate
      if (packageInfo.effectiveFeeRate < 1) {
        errors.push(
          `Package fee rate too low: ${packageInfo.effectiveFeeRate.toFixed(2)} sat/vB`,
        );
      }
    } catch (error) {
      errors.push(
        `Package validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      packageInfo,
    };
  }

  /**
   * Optimize CPFP fee allocation
   */
  optimizeFeeAllocation(
    parentTxs: Transaction[],
    availableValue: number,
    targetFeeRate: number,
  ): {
    recommendedChildFee: number;
    optimalOutputValue: number;
    effectivePackageRate: number;
  } {
    const parentPackageSize = parentTxs.reduce(
      (sum, tx) => sum + tx.virtualSize(),
      0,
    );
    const parentPackageFee = parentTxs.reduce(
      (sum, tx) => sum + this.estimateTransactionFee(tx),
      0,
    );

    // Estimate child size (assuming 1 output for simplicity)
    const estimatedChildSize = this.estimateChildSize(1, 1);

    // Calculate optimal child fee
    const totalPackageSize = parentPackageSize + estimatedChildSize;
    const targetTotalFee = Math.ceil(totalPackageSize * targetFeeRate);
    const recommendedChildFee = Math.max(0, targetTotalFee - parentPackageFee);

    // Ensure we don't exceed available value
    const maxChildFee = availableValue - this.dustThreshold;
    const finalChildFee = Math.min(recommendedChildFee, maxChildFee);

    const optimalOutputValue = availableValue - finalChildFee;
    const actualTotalFee = parentPackageFee + finalChildFee;
    const effectivePackageRate = actualTotalFee / totalPackageSize;

    return {
      recommendedChildFee: finalChildFee,
      optimalOutputValue,
      effectivePackageRate,
    };
  }

  // Private helper methods

  private validateCPFPConfig(
    config: CPFPConfig,
    parentTxs: Transaction[],
  ): void {
    if (config.parentTxids.length === 0) {
      throw new Error('At least one parent transaction is required');
    }

    if (config.parentTxids.length !== parentTxs.length) {
      throw new Error(
        'Number of parent TXIDs must match number of parent transactions',
      );
    }

    if (config.parentOutputs.length === 0) {
      throw new Error('At least one parent output is required');
    }

    if (config.targetPackageFeeRate <= 0) {
      throw new Error('Target package fee rate must be positive');
    }

    // Validate parent outputs exist in parent transactions
    for (const output of config.parentOutputs) {
      const parentTx = parentTxs.find((tx) => tx.getId() === output.txid);
      if (!parentTx) {
        throw new Error(`Parent transaction ${output.txid} not found`);
      }

      if (output.vout >= parentTx.outs.length) {
        throw new Error(
          `Output ${output.vout} does not exist in transaction ${output.txid}`,
        );
      }

      const actualOutput = parentTx.outs[output.vout];
      if (actualOutput && actualOutput.value !== output.value) {
        throw new Error(
          `Output value mismatch for ${output.txid}:${output.vout}`,
        );
      }
    }
  }

  private calculateParentPackageFee(
    parentTxs: Transaction[],
    parentFeeRates: number[],
  ): number {
    let totalFee = 0;

    for (let i = 0; i < parentTxs.length; i++) {
      const tx = parentTxs[i]!;
      const feeRate = parentFeeRates[i] || 1; // Default to 1 sat/vB
      totalFee += Math.ceil(tx.virtualSize() * feeRate);
    }

    return totalFee;
  }

  private estimateChildSize(numInputs: number, numOutputs: number): number {
    // Rough estimation for SegWit transaction
    const baseSize = 10; // version, locktime, counts
    const inputSize = numInputs * 68; // Approximate SegWit input size
    const outputSize = numOutputs * 31; // Approximate output size
    return baseSize + inputSize + outputSize;
  }

  private estimateTransactionSize(psbt: Psbt): number {
    const inputCount = psbt.inputCount;
    const outputCount = psbt.txOutputs.length;
    return this.estimateChildSize(inputCount, outputCount);
  }

  private estimateTransactionFee(tx: Transaction): number {
    // This is a simplified estimation
    // In practice, you'd need actual input values
    const estimatedFeeRate = 10; // sat/vB default
    return tx.virtualSize() * estimatedFeeRate;
  }

  private buildPackageInfo(
    parentTxs: Transaction[],
    childPsbt: Psbt,
  ): PackageInfo {
    const transactions: PackageInfo['transactions'] = [];
    const dependencies = new Map<string, string[]>();

    // Add parent transactions
    for (const tx of parentTxs) {
      const txid = tx.getId();
      const inputs = tx.ins.map(
        (input) => `${Buffer.from(input.hash).reverse().toString('hex')}:${input.index}`,
      );
      const outputs = tx.outs.map((out) => ({ value: out.value }));

      transactions.push({
        txid,
        size: tx.virtualSize(),
        fee: this.estimateTransactionFee(tx),
        feeRate: this.estimateTransactionFee(tx) / tx.virtualSize(),
        inputs,
        outputs,
      });

      // For simplicity, assume parents have no dependencies within the package
      dependencies.set(txid, []);
    }

    // Add child transaction
    const childInputs: string[] = [];
    const childParents: string[] = [];

    for (let i = 0; i < childPsbt.inputCount; i++) {
      const input = childPsbt.txInputs[i];
      if (input) {
        const inputTxid = Buffer.from(input.hash).reverse().toString('hex');
        const inputOutpoint = `${inputTxid}:${input.index}`;
        childInputs.push(inputOutpoint);

        // Check if this input comes from a parent in our package
        if (parentTxs.some((tx) => tx.getId() === inputTxid)) {
          childParents.push(inputTxid);
        }
      }
    }

    const childOutputs: Array<{ value: number }> = [];
    for (let i = 0; i < childPsbt.txOutputs.length; i++) {
      const output = childPsbt.txOutputs[i];
      if (output) {
        childOutputs.push({ value: output.value });
      }
    }

    const childSize = this.estimateTransactionSize(childPsbt);
    const childFee = this.calculateChildFee(childPsbt);

    // Generate a temporary txid for the child transaction based on its inputs and outputs
    const childTxid = this.generateTemporaryTxid(childPsbt);

    transactions.push({
      txid: childTxid,
      size: childSize,
      fee: childFee,
      feeRate: childFee / childSize,
      inputs: childInputs,
      outputs: childOutputs,
    });

    dependencies.set(childTxid, childParents);

    // Calculate totals
    const totalSize = transactions.reduce(
      (sum: number, tx: any) => sum + tx.size,
      0,
    );
    const totalFee = transactions.reduce(
      (sum: number, tx: any) => sum + tx.fee,
      0,
    );
    const effectiveFeeRate = totalFee / totalSize;

    return {
      txids: transactions.map((tx: any) => tx.txid),
      totalSize,
      totalFee,
      effectiveFeeRate,
      transactions,
      dependencies,
    };
  }

  private calculateChildFee(psbt: Psbt): number {
    // Calculate from input values - output values
    let inputValue = 0;
    let outputValue = 0;

    // Sum output values
    for (let i = 0; i < psbt.txOutputs.length; i++) {
      const output = psbt.txOutputs[i];
      if (output) {
        outputValue += output.value;
      }
    }

    // For input values, we'd need to look up the UTXOs
    // For now, estimate based on witness UTXO data
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      if (input?.witnessUtxo) {
        inputValue += input.witnessUtxo.value;
      }
    }

    return Math.max(0, inputValue - outputValue);
  }

  private detectCircularDependencies(packageInfo: PackageInfo): string[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (txid: string, path: string[]): string[] | null => {
      if (recursionStack.has(txid)) {
        // Found cycle - return the cycle path
        const cycleStart = path.indexOf(txid);
        return path.slice(cycleStart).concat([txid]);
      }

      if (visited.has(txid)) {
        return null;
      }

      visited.add(txid);
      recursionStack.add(txid);

      const dependencies = packageInfo.dependencies.get(txid) || [];
      for (const dep of dependencies) {
        const cycle = hasCycle(dep, [...path, txid]);
        if (cycle) {
          return cycle;
        }
      }

      recursionStack.delete(txid);
      return null;
    };

    // Check each transaction for cycles
    for (const txid of packageInfo.txids) {
      const cycle = hasCycle(txid, []);
      if (cycle) {
        return cycle;
      }
    }

    return [];
  }

  /**
   * Generate a temporary transaction ID for a PSBT
   * This is a placeholder ID that represents the transaction before it's finalized
   */
  private generateTemporaryTxid(psbt: Psbt): string {
    // Create a deterministic ID based on inputs and outputs
    // This won't be the actual txid but provides a unique identifier for tracking
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');

    // Hash all inputs
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.txInputs[i];
      if (input) {
        hash.update(input.hash);
        hash.update(Buffer.from([input.index]));
      }
    }

    // Hash all outputs
    for (let i = 0; i < psbt.txOutputs.length; i++) {
      const output = psbt.txOutputs[i];
      if (output) {
        hash.update(output.script);
        const valueBuffer = Buffer.alloc(8);
        valueBuffer.writeUInt32LE(output.value, 0);
        hash.update(valueBuffer);
      }
    }

    return `temp_${hash.digest('hex').slice(0, 16)}`;
  }
}
