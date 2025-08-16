/**
 * RBF (Replace-By-Fee) Builder
 * Implementation for creating replacement transactions
 */

import { Buffer } from 'node:buffer';

import * as bitcoin from 'bitcoinjs-lib';
import type { Network, Psbt, Transaction } from 'bitcoinjs-lib';

import type { UTXO } from '../interfaces/provider.interface.ts';
import type { IRBFBuilder, RBFConfig, RBFTransaction } from '../interfaces/rbf-cpfp.interface.ts';
import { InsufficientFeeBumpError } from '../interfaces/rbf-cpfp.interface.ts';

/**
 * RBF Builder Implementation
 */
export class RBFBuilder implements IRBFBuilder {
  private network: Network;
  private defaultMinFeeIncrease = 1; // sat/vB minimum increase

  constructor(network: Network = bitcoin.networks.bitcoin) {
    this.network = network;
  }

  /**
   * Create RBF replacement transaction
   */
  createReplacement(
    originalTx: Transaction,
    config: RBFConfig,
    availableUtxos: UTXO[],
  ): Promise<RBFTransaction> {
    // Validate original transaction signals RBF
    if (!this.signalsRBF(originalTx)) {
      throw new Error(
        'Original transaction does not signal RBF (sequence >= 0xfffffffe)',
      );
    }

    // Calculate original transaction metrics
    const originalSize = originalTx.virtualSize();
    let originalFee: number;
    try {
      originalFee = this.calculateTransactionFee(originalTx, availableUtxos);
      // If we can't find the original UTXOs (common case), estimate
      if (originalFee <= 0) {
        throw new Error('Cannot calculate fee from available UTXOs');
      }
    } catch {
      // If we can't calculate the exact fee, estimate based on size and config
      const estimatedFeeRate = config.originalFeeRate || 10; // Use provided rate or default 10 sat/vB
      originalFee = Math.max(1, Math.ceil(originalSize * estimatedFeeRate));
    }

    const originalFeeRate = originalFee / originalSize;

    // Determine target fee rate
    const minRequiredFeeRate = originalFeeRate +
      (config.minFeeRateIncrease || this.defaultMinFeeIncrease);
    let targetFeeRate = config.targetFeeRate || minRequiredFeeRate;

    // Apply maximum fee rate cap if specified
    if (config.maxFeeRate && targetFeeRate > config.maxFeeRate) {
      targetFeeRate = config.maxFeeRate;
    }

    if (targetFeeRate < minRequiredFeeRate) {
      throw new InsufficientFeeBumpError(
        config.originalTxid,
        config.minFeeRateIncrease || this.defaultMinFeeIncrease,
        targetFeeRate - originalFeeRate,
      );
    }

    // Create replacement PSBT
    const psbt = new bitcoin.Psbt({ network: this.network });

    // Set version and locktime to match original if not replacing all inputs
    if (!config.replaceAllInputs) {
      psbt.setVersion(originalTx.version);
      if (originalTx.locktime > 0) {
        psbt.setLocktime(originalTx.locktime);
      }
    }

    // Add inputs (with RBF signaling)
    const inputUtxos: UTXO[] = [];
    let addedInputs = false;
    const addedUtxos: UTXO[] = [];

    if (config.replaceAllInputs) {
      // Replace all inputs - use available UTXOs
      const selectedUtxos = this.selectUtxosForReplacement(
        availableUtxos,
        this.calculateTotalOutputValue(originalTx),
        targetFeeRate,
      );

      for (const utxo of selectedUtxos) {
        this.addInputToPsbt(psbt, utxo);
        inputUtxos.push(utxo);
      }

      addedInputs = true;
      addedUtxos.push(...selectedUtxos);
    } else {
      // Keep original inputs, potentially add more for fee
      const originalInputs = this.extractOriginalInputs(
        originalTx,
        availableUtxos,
      );

      for (const utxo of originalInputs) {
        this.addInputToPsbt(psbt, utxo, true); // Enable RBF
        inputUtxos.push(utxo);
      }

      // Check if additional inputs needed for fee bump
      const currentValue = inputUtxos.reduce(
        (sum, utxo) => sum + utxo.value,
        0,
      );
      const outputValue = this.calculateTotalOutputValue(originalTx);
      const estimatedSize = this.estimateReplacementSize(originalTx, 0);
      const requiredFee = Math.ceil(estimatedSize * targetFeeRate);

      if (currentValue < outputValue + requiredFee) {
        const additionalValueNeeded = outputValue + requiredFee - currentValue;
        const additionalUtxos = this.selectAdditionalUtxos(
          config.additionalUtxos || [],
          additionalValueNeeded,
        );

        if (additionalUtxos.length > 0) {
          for (const utxo of additionalUtxos) {
            this.addInputToPsbt(psbt, utxo, true); // Enable RBF
            inputUtxos.push(utxo);
          }
          addedInputs = true;
          addedUtxos.push(...additionalUtxos);
        }
      }
    }

    // Add outputs (copy from original, adjust for fee)
    const totalInputValue = inputUtxos.reduce(
      (sum, utxo) => sum + utxo.value,
      0,
    );
    this.addOutputsToPsbt(
      psbt,
      originalTx,
      totalInputValue,
      targetFeeRate,
      config.changeAddress,
    );

    // Calculate final metrics
    const newSize = this.estimateTransactionSize(psbt);
    const newFee = totalInputValue - this.getTotalOutputValue(psbt);
    const newFeeRate = newFee / newSize;

    // Validate replacement
    const validation = this.validateRBF(originalTx, psbt);

    const result: RBFTransaction = {
      psbt,
      originalTxid: config.originalTxid,
      originalFee,
      newFee,
      feeIncrease: newFee - originalFee,
      originalFeeRate,
      newFeeRate,
      addedInputs,
      addedUtxos,
      valid: validation.valid,
      messages: [...validation.errors, ...validation.warnings],
    };

    return Promise.resolve(result);
  }

  /**
   * Calculate minimum fee for RBF
   */
  calculateMinimumRBFFee(originalTx: Transaction, newSize?: number): number {
    const originalFee = this.estimateOriginalFee(originalTx);
    const size = newSize || originalTx.virtualSize();

    // BIP 125: replacement must pay higher absolute fee and fee rate
    const minFeeIncrease = Math.max(
      1, // Minimum 1 satoshi increase
      Math.ceil(size * this.defaultMinFeeIncrease), // Minimum rate increase
    );

    return originalFee + minFeeIncrease;
  }

  /**
   * Validate RBF transaction
   */
  validateRBF(
    originalTx: Transaction,
    replacementPsbt: Psbt,
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check RBF signaling in original transaction
      if (!this.signalsRBF(originalTx)) {
        errors.push('Original transaction does not signal RBF');
      }

      // Check RBF signaling in replacement
      if (!this.signalsRBF(replacementPsbt)) {
        warnings.push(
          'Replacement transaction does not signal RBF for future replacements',
        );
      }

      // Validate fee increase (BIP 125 rule 3)
      const originalFee = this.estimateOriginalFee(originalTx);
      const replacementFee = this.calculatePsbtFee(replacementPsbt);

      if (replacementFee <= originalFee) {
        errors.push(
          `Replacement fee (${replacementFee}) must be higher than original fee (${originalFee})`,
        );
      }

      // Validate fee rate increase (BIP 125 rule 4)
      const originalFeeRate = originalFee / originalTx.virtualSize();
      const replacementSize = this.estimateTransactionSize(replacementPsbt);
      const replacementFeeRate = replacementFee / replacementSize;

      if (replacementFeeRate <= originalFeeRate) {
        errors.push(
          `Replacement fee rate (${replacementFeeRate.toFixed(2)}) must be higher than original (${
            originalFeeRate.toFixed(2)
          })`,
        );
      }

      // Check for additional unconfirmed dependencies (BIP 125 rule 2)
      // This would require mempool information, so we add a warning
      warnings.push('Verify replacement does not add unconfirmed dependencies');
    } catch (error) {
      errors.push(
        `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if transaction signals RBF
   */
  signalsRBF(tx: Transaction | Psbt): boolean {
    if (tx instanceof bitcoin.Psbt) {
      // Check PSBT inputs
      for (let i = 0; i < tx.inputCount; i++) {
        const sequence = tx.txInputs[i]?.sequence ?? 0xffffffff;
        if (sequence < 0xfffffffe) {
          return true;
        }
      }
      return false;
    } else {
      // Check transaction inputs
      for (const input of tx.ins) {
        if (input.sequence < 0xfffffffe) {
          return true;
        }
      }
      return false;
    }
  }

  /**
   * Enable RBF signaling in PSBT
   */
  enableRBF(psbt: Psbt): void {
    for (let i = 0; i < psbt.inputCount; i++) {
      psbt.setInputSequence(i, 0xfffffffd);
    }
  }

  // Private helper methods

  private calculateTransactionFee(tx: Transaction, utxos: UTXO[]): number {
    // Calculate input value
    let inputValue = 0;
    for (const input of tx.ins) {
      const utxo = utxos.find(
        (u) =>
          u.txid === Buffer.from(input.hash).reverse().toString('hex') &&
          u.vout === input.index,
      );
      if (utxo) {
        inputValue += utxo.value;
      }
    }

    // Calculate output value
    const outputValue = tx.outs.reduce((sum, out) => sum + out.value, 0);

    return inputValue - outputValue;
  }

  private calculateTotalOutputValue(tx: Transaction): number {
    return tx.outs.reduce((sum, out) => sum + out.value, 0);
  }

  private extractOriginalInputs(
    tx: Transaction,
    availableUtxos: UTXO[],
  ): UTXO[] {
    const inputs: UTXO[] = [];

    for (const input of tx.ins) {
      const txid = Buffer.from(input.hash).reverse().toString('hex');
      const vout = input.index;

      const utxo = availableUtxos.find((u) => u.txid === txid && u.vout === vout);
      if (utxo) {
        inputs.push(utxo);
      }
    }

    return inputs;
  }

  private selectUtxosForReplacement(
    availableUtxos: UTXO[],
    targetValue: number,
    feeRate: number,
  ): UTXO[] {
    // Simple selection algorithm - can be enhanced with more sophisticated logic
    const sorted = [...availableUtxos].sort((a, b) => b.value - a.value);
    const selected: UTXO[] = [];
    let totalValue = 0;

    for (const utxo of sorted) {
      selected.push(utxo);
      totalValue += utxo.value;

      // Estimate fee for current selection
      const estimatedSize = this.estimateInputOutputSize(selected.length, 2); // Assume 2 outputs
      const estimatedFee = Math.ceil(estimatedSize * feeRate);

      if (totalValue >= targetValue + estimatedFee) {
        break;
      }
    }

    return selected;
  }

  private selectAdditionalUtxos(
    availableUtxos: UTXO[],
    additionalValue: number,
  ): UTXO[] {
    const sorted = [...availableUtxos].sort((a, b) => a.value - b.value); // Prefer smaller UTXOs first
    const selected: UTXO[] = [];
    let totalValue = 0;

    for (const utxo of sorted) {
      selected.push(utxo);
      totalValue += utxo.value;

      if (totalValue >= additionalValue) {
        break;
      }
    }

    return selected;
  }

  private addInputToPsbt(psbt: Psbt, utxo: UTXO, enableRbf = true): void {
    const inputData: any = {
      hash: Buffer.from(utxo.txid, 'hex').reverse(), // Convert hex string to reversed buffer
      index: utxo.vout,
    };

    // Enable RBF signaling
    if (enableRbf) {
      inputData.sequence = 0xfffffffd;
    }

    // Add witness UTXO (required for SegWit)
    inputData.witnessUtxo = {
      script: Buffer.from(utxo.scriptPubKey, 'hex'),
      value: utxo.value,
    };

    psbt.addInput(inputData);
  }

  private addOutputsToPsbt(
    psbt: Psbt,
    originalTx: Transaction,
    totalInputValue: number,
    targetFeeRate: number,
    changeAddress?: string,
  ): void {
    const estimatedSize = this.estimateReplacementSize(
      originalTx,
      psbt.inputCount - originalTx.ins.length,
    );
    const targetFee = Math.ceil(estimatedSize * targetFeeRate);

    let remainingValue = totalInputValue - targetFee;

    // Add original outputs (except change if we're modifying it)
    for (let i = 0; i < originalTx.outs.length; i++) {
      const output = originalTx.outs[i]!;

      // Check if this might be a change output (last output, under certain threshold)
      const mightBeChange = i === originalTx.outs.length - 1 && changeAddress;

      if (mightBeChange && output.value > remainingValue) {
        // Adjust change output
        if (remainingValue > 546) {
          // Dust threshold
          psbt.addOutput({
            address: changeAddress,
            value: remainingValue,
          });
        }
        remainingValue = 0;
      } else {
        // Copy original output
        try {
          const address = bitcoin.address.fromOutputScript(
            output.script,
            this.network,
          );
          psbt.addOutput({
            address,
            value: output.value,
          });
          remainingValue -= output.value;
        } catch {
          // If address extraction fails, use script directly
          psbt.addOutput({
            script: output.script,
            value: output.value,
          });
          remainingValue -= output.value;
        }
      }
    }

    // Add new change output if needed
    if (
      remainingValue > 546 && changeAddress && !this.hasChangeOutput(originalTx)
    ) {
      psbt.addOutput({
        address: changeAddress,
        value: remainingValue,
      });
    }
  }

  private estimateReplacementSize(
    originalTx: Transaction,
    additionalInputs: number,
  ): number {
    // Rough estimation based on original transaction
    const baseSize = originalTx.virtualSize();
    const additionalInputSize = additionalInputs * 68; // Approximate SegWit input size
    return baseSize + additionalInputSize;
  }

  private estimateInputOutputSize(
    numInputs: number,
    numOutputs: number,
  ): number {
    // Rough estimation for SegWit transactions
    const baseSize = 10; // version, locktime, input/output counts
    const inputSize = numInputs * 68; // Approximate SegWit input size
    const outputSize = numOutputs * 31; // Approximate output size
    return baseSize + inputSize + outputSize;
  }

  private estimateTransactionSize(psbt: Psbt): number {
    // Rough estimation - in production, use more accurate calculation
    const inputCount = psbt.inputCount;
    const outputCount = psbt.txOutputs.length;
    return this.estimateInputOutputSize(inputCount, outputCount);
  }

  private getTotalOutputValue(psbt: Psbt): number {
    let total = 0;
    for (let i = 0; i < psbt.txOutputs.length; i++) {
      total += psbt.txOutputs[i]?.value ?? 0;
    }
    return total;
  }

  private calculatePsbtFee(psbt: Psbt): number {
    let inputValue = 0;
    let outputValue = 0;

    // Calculate total input value from witness UTXOs
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      if (input?.witnessUtxo) {
        inputValue += input.witnessUtxo.value;
      } else if (input?.nonWitnessUtxo) {
        // For non-SegWit inputs, we need to extract the value from the full transaction
        // This is more complex and requires parsing the transaction
        throw new Error(
          'Non-witness UTXO calculation not implemented - use witness UTXOs for fee calculation',
        );
      } else {
        throw new Error(
          `Missing UTXO data for input ${i} - cannot calculate fee`,
        );
      }
    }

    // Calculate total output value
    for (let i = 0; i < psbt.txOutputs.length; i++) {
      const output = psbt.txOutputs[i];
      if (output) {
        outputValue += output.value;
      }
    }

    // Fee = inputs - outputs
    const fee = inputValue - outputValue;

    if (fee < 0) {
      throw new Error(
        `Invalid fee calculation: ${fee} (inputs: ${inputValue}, outputs: ${outputValue})`,
      );
    }

    return fee;
  }

  private estimateOriginalFee(tx: Transaction): number {
    // This is a placeholder - in practice, you'd need UTXO information
    // For now, estimate based on size and average fee rate
    const estimatedFeeRate = 10; // sat/vB
    return tx.virtualSize() * estimatedFeeRate;
  }

  private hasChangeOutput(tx: Transaction): boolean {
    // Simple heuristic - check if last output is under a threshold
    if (tx.outs.length === 0) return false;
    const lastOutput = tx.outs[tx.outs.length - 1]!;
    return lastOutput.value < 10000; // 0.0001 BTC threshold
  }
}
