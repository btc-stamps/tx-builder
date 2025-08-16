/**
 * Enhanced PSBT Builder
 * BIP-174 compliant PSBT builder with advanced features
 */

import { Buffer } from 'node:buffer';

import * as bitcoin from 'bitcoinjs-lib';

import type {
  DerivationPath,
  IHardwareWallet,
  SignPsbtOptions,
} from '../interfaces/hardware.interface.ts';

import { PSBTBuilder, PSBTOptions } from './psbt-builder.ts';

export interface EnhancedPSBTOptions extends PSBTOptions {
  /** Enable strict BIP-174 compliance */
  strictCompliance?: boolean;
  /** Enable hardware wallet mode */
  hardwareWalletMode?: boolean;
  /** Target hardware wallet type */
  targetWalletType?: 'ledger' | 'trezor' | 'coldcard';
}

export interface PSBTMetadata {
  /** Transaction version */
  version?: number;
  /** Transaction locktime */
  locktime?: number;
  /** Input count */
  inputCount: number;
  /** Output count */
  outputCount: number;
  /** Fee amount */
  fee?: number;
  /** Fee rate (sat/vB) */
  feeRate?: number;
  /** Transaction size estimate */
  estimatedSize?: number;
  /** RBF enabled */
  rbfEnabled?: boolean;
}

export interface InputMetadata {
  /** Input index */
  index: number;
  /** Previous transaction ID */
  prevTxid: string;
  /** Previous output index */
  prevVout: number;
  /** Input value */
  value: number;
  /** Input script type */
  scriptType:
    | 'p2pkh'
    | 'p2wpkh'
    | 'p2sh-p2wpkh'
    | 'p2tr'
    | 'p2wsh'
    | 'p2sh'
    | 'unknown';
  /** Sequence number */
  sequence: number;
  /** Has witness UTXO */
  hasWitnessUtxo: boolean;
  /** Has non-witness UTXO */
  hasNonWitnessUtxo: boolean;
  /** BIP32 derivation paths */
  derivationPaths: DerivationPath[];
  /** Signatures count */
  signaturesCount: number;
  /** Required signatures count */
  signaturesRequired: number;
}

export interface OutputMetadata {
  /** Output index */
  index: number;
  /** Output value */
  value: number;
  /** Output address (if applicable) */
  address?: string;
  /** Output script type */
  scriptType:
    | 'p2pkh'
    | 'p2wpkh'
    | 'p2sh'
    | 'p2tr'
    | 'p2wsh'
    | 'op_return'
    | 'unknown';
  /** Is change output */
  isChange?: boolean;
  /** BIP32 derivation paths */
  derivationPaths: DerivationPath[];
}

/**
 * Enhanced PSBT Builder with BIP-174 compliance and advanced features
 */
export class EnhancedPSBTBuilder extends PSBTBuilder {
  private options:
    & Required<
      Omit<
        EnhancedPSBTOptions,
        | 'targetWalletType'
        | 'network'
        | 'maximumFeeRate'
        | 'version'
        | 'locktime'
      >
    >
    & {
      targetWalletType?: 'ledger' | 'trezor' | 'coldcard';
      network: bitcoin.Network;
      maximumFeeRate: number;
      version: number;
      locktime: number;
    };
  private inputDerivations: Map<
    number,
    Array<{ derivation: DerivationPath; publicKey: Buffer }>
  >;
  private outputDerivations: Map<
    number,
    Array<{ derivation: DerivationPath; publicKey: Buffer }>
  >;

  constructor(options: EnhancedPSBTOptions = {}) {
    super(options);
    this.options = {
      network: options.network ?? bitcoin.networks.bitcoin,
      maximumFeeRate: options.maximumFeeRate ?? 100,
      version: options.version ?? 2,
      locktime: options.locktime ?? 0,
      strictCompliance: options.strictCompliance ?? false,
      hardwareWalletMode: options.hardwareWalletMode ?? false,
      ...(options.targetWalletType ? { targetWalletType: options.targetWalletType } : {}),
    };

    this.inputDerivations = new Map();
    this.outputDerivations = new Map();
  }

  /**
   * Add input with enhanced validation and metadata
   */
  addEnhancedInput(
    txid: string,
    vout: number,
    options: {
      sequence?: number;
      witnessUtxo?: { script: Buffer; value: number };
      nonWitnessUtxo?: Buffer;
      redeemScript?: Buffer;
      witnessScript?: Buffer;
      derivationPaths?: DerivationPath[];
      publicKeys?: Buffer[];
    } = {},
  ): this {
    // Add the input using parent class
    super.addInput(txid, vout, options);

    // Store derivation information
    if (
      options.derivationPaths && options.publicKeys &&
      options.derivationPaths.length === options.publicKeys.length
    ) {
      const inputIndex = this.getPSBT().inputCount - 1;
      const derivations = options.derivationPaths.map((derivation, index) => ({
        derivation,
        publicKey: options.publicKeys![index] as Buffer, // Explicit type assertion
      }));
      this.inputDerivations.set(inputIndex, derivations);

      // Add derivation to PSBT
      derivations.forEach(({ derivation, publicKey }) => {
        if (derivation && publicKey) {
          this.addInputDerivation(inputIndex, derivation, publicKey);
        }
      });
    }

    return this;
  }

  /**
   * Add output with enhanced validation and metadata
   */
  addEnhancedOutput(
    addressOrScript: string | Buffer,
    value: number,
    options: {
      derivationPaths?: DerivationPath[];
      publicKeys?: Buffer[];
      isChange?: boolean;
    } = {},
  ): this {
    // Add the output using parent class
    super.addOutput(addressOrScript, value);

    // Store derivation information
    if (
      options.derivationPaths && options.publicKeys &&
      options.derivationPaths.length === options.publicKeys.length
    ) {
      const outputIndex = this.getPSBT().txOutputs.length - 1;
      const derivations = options.derivationPaths.map((derivation, index) => ({
        derivation,
        publicKey: options.publicKeys![index] as Buffer, // Explicit type assertion
      }));
      this.outputDerivations.set(outputIndex, derivations);

      // Add derivation to PSBT
      derivations.forEach(({ derivation, publicKey }) => {
        if (derivation && publicKey) {
          this.addOutputDerivation(outputIndex, derivation, publicKey);
        }
      });
    }

    return this;
  }

  /**
   * Add BIP32 derivation information to input
   */
  addInputDerivation(
    inputIndex: number,
    derivation: DerivationPath,
    publicKey: Buffer,
  ): void {
    const psbt = this.getPSBT();

    if (inputIndex >= psbt.inputCount) {
      throw new Error(`Input index ${inputIndex} out of range`);
    }

    // Add BIP32 derivation
    psbt.updateInput(inputIndex, {
      bip32Derivation: [
        {
          masterFingerprint: derivation.masterFingerprint,
          path: derivation.path,
          pubkey: publicKey,
        },
      ],
    });
  }

  /**
   * Add BIP32 derivation information to output
   */
  addOutputDerivation(
    outputIndex: number,
    derivation: DerivationPath,
    publicKey: Buffer,
  ): void {
    const psbt = this.getPSBT();

    if (outputIndex >= psbt.txOutputs.length) {
      throw new Error(`Output index ${outputIndex} out of range`);
    }

    // Add BIP32 derivation
    psbt.updateOutput(outputIndex, {
      bip32Derivation: [
        {
          masterFingerprint: derivation.masterFingerprint,
          path: derivation.path,
          pubkey: publicKey,
        },
      ],
    });
  }

  /**
   * Set input witness UTXO (required for segwit inputs)
   */
  setInputWitnessUtxo(
    inputIndex: number,
    witnessUtxo: { script: Buffer; value: number },
  ): void {
    const psbt = this.getPSBT();

    if (inputIndex >= psbt.inputCount) {
      throw new Error(`Input index ${inputIndex} out of range`);
    }

    psbt.updateInput(inputIndex, { witnessUtxo });
  }

  /**
   * Set input non-witness UTXO for legacy inputs
   */
  setInputNonWitnessUtxo(inputIndex: number, nonWitnessUtxo: Buffer): void {
    const psbt = this.getPSBT();

    if (inputIndex >= psbt.inputCount) {
      throw new Error(`Input index ${inputIndex} out of range`);
    }

    psbt.updateInput(inputIndex, { nonWitnessUtxo });
  }

  /**
   * Add redeem script for P2SH inputs
   */
  addInputRedeemScript(inputIndex: number, redeemScript: Buffer): void {
    const psbt = this.getPSBT();

    if (inputIndex >= psbt.inputCount) {
      throw new Error(`Input index ${inputIndex} out of range`);
    }

    psbt.updateInput(inputIndex, { redeemScript });
  }

  /**
   * Add witness script for P2WSH inputs
   */
  addInputWitnessScript(inputIndex: number, witnessScript: Buffer): void {
    const psbt = this.getPSBT();

    if (inputIndex >= psbt.inputCount) {
      throw new Error(`Input index ${inputIndex} out of range`);
    }

    psbt.updateInput(inputIndex, { witnessScript });
  }

  /**
   * Get comprehensive PSBT metadata
   */
  getMetadata(): PSBTMetadata {
    const psbt = this.getPSBT();

    return {
      ...(psbt.version !== undefined && { version: psbt.version }),
      ...(psbt.locktime !== undefined && { locktime: psbt.locktime }),
      inputCount: psbt.inputCount,
      outputCount: psbt.txOutputs.length,
      ...(this.calculateFeeIfPossible() !== undefined &&
        { fee: this.calculateFeeIfPossible()! }),
      ...(this.calculateFeeRateIfPossible() !== undefined &&
        { feeRate: this.calculateFeeRateIfPossible()! }),
      estimatedSize: this.estimateTransactionSize(),
      rbfEnabled: this.isRbfEnabled(),
    };
  }

  /**
   * Get input metadata
   */
  getInputMetadata(inputIndex: number): InputMetadata {
    const psbt = this.getPSBT();

    if (inputIndex >= psbt.inputCount) {
      throw new Error(`Input index ${inputIndex} out of range`);
    }

    const input = psbt.data.inputs[inputIndex];
    const txInput = psbt.txInputs[inputIndex];

    if (!input || !txInput) {
      throw new Error(`Input ${inputIndex} not found`);
    }

    return {
      index: inputIndex,
      prevTxid: txInput.hash.toString('hex'),
      prevVout: txInput.index,
      value: input.witnessUtxo?.value ?? 0,
      scriptType: this.detectInputScriptType(input),
      sequence: txInput.sequence ?? 0xffffffff, // Default to maximum sequence number
      hasWitnessUtxo: !!input.witnessUtxo,
      hasNonWitnessUtxo: !!input.nonWitnessUtxo,
      derivationPaths: this.inputDerivations.get(inputIndex)?.map((d) => d.derivation) ?? [],
      signaturesCount: input.partialSig?.length ?? 0,
      signaturesRequired: 1, // @todo(complexity): Detect multisig signature count
    };
  }

  /**
   * Get output metadata
   */
  getOutputMetadata(outputIndex: number): OutputMetadata {
    const psbt = this.getPSBT();

    if (outputIndex >= psbt.txOutputs.length) {
      throw new Error(`Output index ${outputIndex} out of range`);
    }

    const txOutput = psbt.txOutputs[outputIndex];

    if (!txOutput) {
      throw new Error(`Output ${outputIndex} not found`);
    }

    const address = this.extractAddressFromScript(txOutput.script);
    return {
      index: outputIndex,
      value: txOutput.value,
      ...(address && { address }),
      scriptType: this.detectOutputScriptType(txOutput.script),
      isChange: this.isChangeOutput(outputIndex),
      derivationPaths: this.outputDerivations.get(outputIndex)?.map((d) => d.derivation) ?? [],
    };
  }

  /**
   * Check if Replace-by-Fee is enabled
   * Note: RBF should be enabled when adding inputs, not after PSBT creation
   */
  getRbfStatus(): boolean {
    return this.isRbfEnabled();
  }

  /**
   * Create enhanced clone with metadata preservation
   */
  enhancedClone(): EnhancedPSBTBuilder {
    // Create a new PSBT from the base64 data instead of trying to combine
    const base64Data = this.psbt.toBase64();
    const clonedPsbt = bitcoin.Psbt.fromBase64(base64Data, {
      network: this.options.network,
    });

    const clone = new EnhancedPSBTBuilder(this.options);
    clone.psbt = clonedPsbt;

    // Copy derivation maps
    this.inputDerivations.forEach((value, key) => {
      clone.inputDerivations.set(key, [...value]);
    });

    this.outputDerivations.forEach((value, key) => {
      clone.outputDerivations.set(key, [...value]);
    });

    return clone;
  }

  // Private helper methods

  private calculateFeeIfPossible(): number | undefined {
    try {
      const psbt = this.getPSBT();
      let totalInputValue = 0;
      let totalOutputValue = 0;

      // Calculate total input value
      for (let i = 0; i < psbt.inputCount; i++) {
        const input = psbt.data.inputs[i];
        if (input?.witnessUtxo) {
          totalInputValue += input.witnessUtxo.value;
        } else if (input?.nonWitnessUtxo) {
          // For non-witness UTXO, we'd need to parse the transaction to get the value
          // For now, skip this calculation if we don't have witnessUtxo
          return undefined;
        }
      }

      // Calculate total output value
      for (let i = 0; i < psbt.txOutputs.length; i++) {
        totalOutputValue += psbt.txOutputs[i]?.value ?? 0;
      }

      return totalInputValue > 0 ? totalInputValue - totalOutputValue : undefined;
    } catch {
      return undefined;
    }
  }

  private calculateFeeRateIfPossible(): number | undefined {
    try {
      return this.getFeeRate();
    } catch {
      return undefined;
    }
  }

  private estimateTransactionSize(): number {
    // Rough estimation - can be improved
    const psbt = this.getPSBT();
    const baseSize = 10; // version + locktime + input/output counts
    const inputSize = psbt.inputCount * 150; // Approximate
    const outputSize = psbt.txOutputs.length * 34; // Approximate
    return baseSize + inputSize + outputSize;
  }

  private isRbfEnabled(): boolean {
    const psbt = this.getPSBT();

    for (let i = 0; i < psbt.inputCount; i++) {
      const sequence = psbt.txInputs[i]?.sequence ?? 0xffffffff;
      if (sequence < 0xfffffffe) {
        return true;
      }
    }

    return false;
  }

  private detectInputScriptType(inputData: any): InputMetadata['scriptType'] {
    if (inputData.witnessUtxo) {
      const script = inputData.witnessUtxo.script;
      if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14) {
        return 'p2wpkh';
      }
      if (script.length === 34 && script[0] === 0x00 && script[1] === 0x20) {
        return 'p2wsh';
      }
    }

    if (inputData.redeemScript) {
      return 'p2sh-p2wpkh';
    }

    return 'p2pkh';
  }

  private detectOutputScriptType(script: Buffer): OutputMetadata['scriptType'] {
    if (script.length === 25 && script[0] === 0x76 && script[1] === 0xa9) {
      return 'p2pkh';
    }
    if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14) {
      return 'p2wpkh';
    }
    if (script.length === 23 && script[0] === 0xa9 && script[22] === 0x87) {
      return 'p2sh';
    }
    if (script.length === 34 && script[0] === 0x00 && script[1] === 0x20) {
      return 'p2wsh';
    }
    if (script.length >= 2 && script[0] === 0x6a) {
      return 'op_return';
    }

    return 'unknown';
  }

  private extractAddressFromScript(script: Buffer): string | undefined {
    try {
      return bitcoin.address.fromOutputScript(script, this.options.network);
    } catch {
      return undefined;
    }
  }

  private isChangeOutput(outputIndex: number): boolean {
    return this.outputDerivations.has(outputIndex);
  }

  /**
   * Validate PSBT for hardware wallet compatibility
   */
  validateForHardwareWallet(
    _walletType: 'ledger' | 'trezor' | 'coldcard',
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const psbt = this.getPSBT();

    // Check inputs have required UTXO information
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      if (!input) {
        issues.push(`Input ${i} missing data`);
        continue;
      }

      if (!input.witnessUtxo && !input.nonWitnessUtxo) {
        issues.push(`Input ${i} missing UTXO information`);
      }

      // Check for derivation paths (required for hardware wallets)
      if (!input.bip32Derivation || input.bip32Derivation.length === 0) {
        issues.push(`Input ${i} missing BIP32 derivation path`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Sign PSBT with hardware wallet
   */
  async signWithHardwareWallet(hardwareWallet: IHardwareWallet): Promise<void> {
    const psbt = this.getPSBT();
    const inputIndices: number[] = [];
    const derivationPaths: DerivationPath[] = [];

    // Collect inputs that need signing
    for (let i = 0; i < psbt.inputCount; i++) {
      const derivations = this.inputDerivations.get(i);
      if (!derivations || derivations.length === 0) {
        throw new Error(`No derivation path found for input ${i}`);
      }

      inputIndices.push(i);
      derivationPaths.push(derivations[0]!.derivation);
    }

    const signOptions: SignPsbtOptions = {
      psbt,
      inputIndices,
      derivationPaths,
      network: this.options.network,
    };

    const result = await hardwareWallet.signPsbt(signOptions);

    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map((e: any) => e.error).join(', ');
      throw new Error(`Signing errors: ${errorMessages}`);
    }

    // Update our PSBT with the signed version
    this.psbt = result.psbt;
  }
}
