/**
 * PSBT Finalizer
 * Comprehensive PSBT finalization implementation
 */

import { Buffer } from 'node:buffer';

import * as bitcoin from 'bitcoinjs-lib';
import type { Psbt, Transaction } from 'bitcoinjs-lib';

import type {
  FinalizationOptions,
  FinalizationResult,
  InputFinalizer,
  IPSBTFinalizer,
} from '../interfaces/psbt-validation.interface.ts';

/**
 * PSBT Finalizer Implementation
 */
export class PSBTFinalizer implements IPSBTFinalizer {
  private customFinalizers: Map<string, InputFinalizer>;

  constructor() {
    this.customFinalizers = new Map();
    this.registerDefaultFinalizers();
  }

  /**
   * Finalize PSBT
   */
  async finalize(
    psbt: Psbt,
    options: FinalizationOptions = {},
  ): Promise<FinalizationResult> {
    const errors: any[] = [];
    const warnings: any[] = [];
    let finalizedInputs = 0;
    const failedInputs: number[] = [];

    const inputIndices = options.inputIndices ||
      Array.from({ length: psbt.inputCount }, (_, i) => i);

    try {
      for (const inputIndex of inputIndices) {
        if (inputIndex >= psbt.inputCount) {
          errors.push({
            rule: 'input_out_of_bounds',
            message: `Input index ${inputIndex} out of bounds`,
            severity: 'critical',
          });
          failedInputs.push(inputIndex);
          continue;
        }

        const success = await this.finalizeInput(psbt, inputIndex, options);

        if (success) {
          finalizedInputs++;
        } else {
          failedInputs.push(inputIndex);
          errors.push({
            rule: 'finalization_failed',
            message: `Failed to finalize input ${inputIndex}`,
            severity: 'critical',
          });
        }
      }

      // Extract transaction if all inputs are finalized and requested
      let transaction: Transaction | undefined;
      let transactionId: string | undefined;

      if (
        options.extractTransaction &&
        finalizedInputs === psbt.inputCount &&
        failedInputs.length === 0
      ) {
        try {
          transaction = this.extractTransaction(psbt);
          transactionId = transaction.getId();
        } catch (error) {
          errors.push({
            rule: 'extraction_failed',
            message: `Failed to extract transaction: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
            severity: 'critical',
          });
        }
      }

      const result: FinalizationResult = {
        success: failedInputs.length === 0,
        finalizedInputs,
        totalInputs: inputIndices.length,
        failedInputs,
        errors,
        warnings,
      };

      if (transaction) {
        result.transaction = transaction;
      }

      if (transactionId) {
        result.transactionId = transactionId;
      }

      return result;
    } catch (error) {
      return {
        success: false,
        finalizedInputs: 0,
        totalInputs: inputIndices.length,
        failedInputs: inputIndices,
        errors: [
          {
            rule: 'finalization_error',
            message: `Finalization failed: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
            severity: 'critical',
          },
        ],
        warnings,
      };
    }
  }

  /**
   * Finalize specific inputs
   */
  finalizeInputs(
    psbt: Psbt,
    inputIndices: number[],
  ): Promise<FinalizationResult> {
    return this.finalize(psbt, { inputIndices });
  }

  /**
   * Check finalization readiness
   */
  async checkFinalizationReadiness(psbt: Psbt): Promise<{
    ready: boolean;
    readyInputs: number[];
    blockedInputs: Array<{ index: number; reason: string }>;
  }> {
    const readyInputs: number[] = [];
    const blockedInputs: Array<{ index: number; reason: string }> = [];

    for (let i = 0; i < psbt.inputCount; i++) {
      const canFinalize = await this.canFinalizeInput(psbt, i);

      if (canFinalize) {
        readyInputs.push(i);
      } else {
        const reason = this.getFinalizationBlockReason(psbt, i);
        blockedInputs.push({ index: i, reason });
      }
    }

    return {
      ready: blockedInputs.length === 0,
      readyInputs,
      blockedInputs,
    };
  }

  /**
   * Extract final transaction
   */
  extractTransaction(psbt: Psbt): Transaction {
    try {
      return psbt.extractTransaction();
    } catch (error) {
      throw new Error(
        `Transaction extraction failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Register custom input finalizer
   */
  registerFinalizer(finalizer: InputFinalizer): void {
    this.customFinalizers.set(finalizer.name, finalizer);
  }

  /**
   * Simulate transaction execution
   */
  simulateExecution(psbt: Psbt): Promise<{
    success: boolean;
    errors: string[];
    gasUsed?: number;
  }> {
    const errors: string[] = [];

    try {
      // Basic simulation - check if transaction can be extracted
      const transaction = this.extractTransaction(psbt);

      // Validate transaction structure
      if (transaction.ins.length === 0) {
        errors.push('Transaction has no inputs');
      }

      if (transaction.outs.length === 0) {
        errors.push('Transaction has no outputs');
      }

      // Check for standard transaction limits
      if (transaction.virtualSize() > 100000) {
        errors.push('Transaction exceeds size limit');
      }

      // Verify input scripts can be executed (basic check)
      for (let i = 0; i < transaction.ins.length; i++) {
        const input = transaction.ins[i];
        if (!input?.script || input.script.length === 0) {
          if (!input?.witness || input.witness.length === 0) {
            errors.push(`Input ${i} has no script or witness data`);
          }
        }
      }

      return Promise.resolve({
        success: errors.length === 0,
        errors,
      });
    } catch (error) {
      errors.push(
        `Simulation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return Promise.resolve({
        success: false,
        errors,
      });
    }
  }

  // Private helper methods

  private registerDefaultFinalizers(): void {
    // Register P2PKH finalizer
    this.registerFinalizer({
      name: 'P2PKH',
      canFinalize: (psbt: Psbt, inputIndex: number) => {
        const input = psbt.data.inputs[inputIndex];
        return !!(input?.nonWitnessUtxo && input?.partialSig &&
          input.partialSig.length > 0);
      },
      finalize: (psbt: Psbt, inputIndex: number) => {
        try {
          psbt.finalizeInput(inputIndex);
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    });

    // Register P2WPKH finalizer
    this.registerFinalizer({
      name: 'P2WPKH',
      canFinalize: (psbt: Psbt, inputIndex: number) => {
        const input = psbt.data.inputs[inputIndex];
        return !!(
          input?.witnessUtxo &&
          input?.partialSig &&
          input.partialSig.length > 0 &&
          this.isP2WPKH(input.witnessUtxo.script)
        );
      },
      finalize: (psbt: Psbt, inputIndex: number) => {
        try {
          psbt.finalizeInput(inputIndex);
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    });

    // Register P2SH-P2WPKH finalizer
    this.registerFinalizer({
      name: 'P2SH-P2WPKH',
      canFinalize: (psbt: Psbt, inputIndex: number) => {
        const input = psbt.data.inputs[inputIndex];
        return !!(
          input?.witnessUtxo &&
          input?.redeemScript &&
          input?.partialSig &&
          input.partialSig.length > 0 &&
          this.isP2SH(input.witnessUtxo.script)
        );
      },
      finalize: (psbt: Psbt, inputIndex: number) => {
        try {
          psbt.finalizeInput(inputIndex);
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    });

    // Register multisig finalizer
    this.registerFinalizer({
      name: 'Multisig',
      canFinalize: (psbt: Psbt, inputIndex: number) => {
        const input = psbt.data.inputs[inputIndex];
        if (!input?.partialSig || input.partialSig.length === 0) return false;

        // Check if we have enough signatures for multisig
        const requiredSigs = this.getRequiredSignatures(psbt, inputIndex);
        return input.partialSig.length >= requiredSigs;
      },
      finalize: (psbt: Psbt, inputIndex: number) => {
        try {
          psbt.finalizeInput(inputIndex);
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    });
  }

  private finalizeInput(
    psbt: Psbt,
    inputIndex: number,
    _options: FinalizationOptions,
  ): Promise<boolean> {
    const input = psbt.data.inputs[inputIndex];

    if (!input) {
      return Promise.resolve(false);
    }

    // Try custom finalizers first
    for (const finalizer of this.customFinalizers.values()) {
      if (finalizer.canFinalize(psbt, inputIndex)) {
        const result = finalizer.finalize(psbt, inputIndex);
        if (result.success) {
          return Promise.resolve(true);
        }
      }
    }

    // Try default bitcoinjs-lib finalization
    try {
      psbt.finalizeInput(inputIndex);
      return Promise.resolve(true);
    } catch {
      // Custom finalization logic could go here
      return Promise.resolve(false);
    }
  }

  private canFinalizeInput(psbt: Psbt, inputIndex: number): Promise<boolean> {
    const input = psbt.data.inputs[inputIndex];

    if (!input) {
      return Promise.resolve(false);
    }

    // Check with custom finalizers
    for (const finalizer of this.customFinalizers.values()) {
      if (finalizer.canFinalize(psbt, inputIndex)) {
        return Promise.resolve(true);
      }
    }

    // Basic checks for standard finalization
    const hasUtxo = !!(input.witnessUtxo || input.nonWitnessUtxo);
    const hasSignatures = !!(input.partialSig && input.partialSig.length > 0);

    return Promise.resolve(hasUtxo && hasSignatures);
  }

  private getFinalizationBlockReason(psbt: Psbt, inputIndex: number): string {
    const input = psbt.data.inputs[inputIndex];

    if (!input) {
      return 'Input data missing';
    }

    const reasons: string[] = [];

    if (!input.witnessUtxo && !input.nonWitnessUtxo) {
      reasons.push('Missing UTXO');
    }

    if (!input.partialSig || input.partialSig.length === 0) {
      reasons.push('Missing signatures');
    }

    // Check for script requirements
    if (input.witnessUtxo) {
      const script = input.witnessUtxo.script;

      if (this.isP2SH(script) && !input.redeemScript) {
        reasons.push('Missing redeem script');
      }

      if (this.isP2WSH(script) && !input.witnessScript) {
        reasons.push('Missing witness script');
      }
    }

    // Check signature requirements for multisig
    if (input.witnessScript || input.redeemScript) {
      const requiredSigs = this.getRequiredSignatures(psbt, inputIndex);
      const currentSigs = input.partialSig?.length || 0;

      if (currentSigs < requiredSigs) {
        reasons.push(
          `Insufficient signatures (${currentSigs}/${requiredSigs})`,
        );
      }
    }

    return reasons.length > 0 ? reasons.join(', ') : 'Unknown reason';
  }

  private getRequiredSignatures(psbt: Psbt, inputIndex: number): number {
    const input = psbt.data.inputs[inputIndex];

    if (!input) {
      return 1;
    }

    // Try to parse multisig script
    const script = input.witnessScript || input.redeemScript;

    if (script) {
      try {
        const decompiled = bitcoin.script.decompile(script);

        if (decompiled && decompiled.length >= 4) {
          // Check if it's a multisig script: OP_M <pubkey1> ... <pubkeyN> OP_N OP_CHECKMULTISIG
          const firstOp = decompiled[0] as number;
          const lastOp = decompiled[decompiled.length - 1];

          if (
            typeof firstOp === 'number' &&
            firstOp >= (bitcoin.opcodes.OP_1 ?? 0x51) &&
            firstOp <= (bitcoin.opcodes.OP_16 ?? 0x60) &&
            lastOp === bitcoin.opcodes.OP_CHECKMULTISIG
          ) {
            // It's a multisig script, return required signature count
            return firstOp - (bitcoin.opcodes.OP_RESERVED ?? 0x50);
          }
        }
      } catch {
        // Script parsing failed, assume single signature
      }
    }

    return 1; // Default to single signature requirement
  }

  private isP2WPKH(script: Buffer): boolean {
    return script.length === 22 && script[0] === 0x00 && script[1] === 0x14;
  }

  private isP2SH(script: Buffer): boolean {
    return script.length === 23 && script[0] === 0xa9 && script[22] === 0x87;
  }

  private isP2WSH(script: Buffer): boolean {
    return script.length === 34 && script[0] === 0x00 && script[1] === 0x20;
  }
}
