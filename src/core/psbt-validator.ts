/**
 * PSBT Validator
 * Comprehensive PSBT validation implementation
 */

import { Buffer } from 'node:buffer';

import * as bitcoin from 'bitcoinjs-lib';
import type { Network, Psbt } from 'bitcoinjs-lib';

import type {
  InputAnalysis,
  InputValidationResult,
  IPSBTValidator,
  OutputAnalysis,
  OutputValidationResult,
  PSBTAnalysisReport,
  PSBTValidationResult,
  PSBTValidationRule,
  TransactionAnalysis,
  ValidationError,
  ValidationWarning,
} from '../interfaces/psbt-validation.interface.ts';

/**
 * PSBT Validator Implementation
 */
export class PSBTValidator implements IPSBTValidator {
  private network: Network;
  private _validationRules: Map<string, PSBTValidationRule>;

  constructor(network: Network = bitcoin.networks.bitcoin) {
    this.network = network;
    this._validationRules = this.initializeValidationRules();

    // Use validation rules for future extensibility
    void this._validationRules;
    void this._hasComplexScripts;
  }

  /**
   * Validate PSBT comprehensively
   */
  async validate(psbt: Psbt, network?: Network): Promise<PSBTValidationResult> {
    const _targetNetwork = network || this.network;

    // Use target network for future network-specific validation
    void _targetNetwork;

    const criticalErrors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const passed: string[] = [];

    try {
      // Validate basic PSBT structure
      await this.validatePSBTStructure(psbt, criticalErrors, warnings, passed);

      // Validate inputs
      const inputValidation: InputValidationResult[] = [];
      for (let i = 0; i < psbt.inputCount; i++) {
        const inputResult = await this.validateInput(psbt, i);
        inputValidation.push(inputResult);

        criticalErrors.push(
          ...inputResult.errors.filter((e) => e.severity === 'critical'),
        );
        warnings.push(...inputResult.warnings);
      }

      // Validate outputs
      const outputValidation: OutputValidationResult[] = [];
      for (let i = 0; i < psbt.txOutputs.length; i++) {
        const outputResult = await this.validateOutput(psbt, i);
        outputValidation.push(outputResult);

        criticalErrors.push(
          ...outputResult.errors.filter((e) => e.severity === 'critical'),
        );
        warnings.push(...outputResult.warnings);
      }

      // Validate transaction-level properties
      await this.validateTransactionLevel_func(
        psbt,
        criticalErrors,
        warnings,
        passed,
      );

      // Generate transaction analysis
      const transactionAnalysis = this.analyzeTransaction(psbt);

      const result: PSBTValidationResult = {
        valid: criticalErrors.length === 0,
        canFinalize: await this.canFinalize(psbt),
        criticalErrors,
        warnings,
        passed,
        inputValidation,
        outputValidation,
        transactionAnalysis,
      };

      return result;
    } catch (error) {
      criticalErrors.push({
        rule: 'validation_error',
        message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'critical',
      });

      return {
        valid: false,
        canFinalize: false,
        criticalErrors,
        warnings,
        passed,
        inputValidation: [],
        outputValidation: [],
        transactionAnalysis: this.getEmptyTransactionAnalysis(),
      };
    }
  }

  /**
   * Validate specific input
   */
  validateInput(
    psbt: Psbt,
    inputIndex: number,
  ): Promise<InputValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (inputIndex >= psbt.inputCount) {
      errors.push({
        rule: 'input_index_bounds',
        message: `Input index ${inputIndex} out of bounds`,
        index: inputIndex,
        severity: 'critical',
      });

      return Promise.resolve({
        index: inputIndex,
        valid: false,
        canFinalize: false,
        errors,
        warnings,
        analysis: this.getEmptyInputAnalysis(),
      });
    }

    const input = psbt.data.inputs[inputIndex];
    const txInput = psbt.txInputs[inputIndex];

    if (!input || !txInput) {
      errors.push({
        rule: 'input_missing',
        message: `Input data missing for index ${inputIndex}`,
        index: inputIndex,
        severity: 'critical',
      });

      return Promise.resolve({
        index: inputIndex,
        valid: false,
        canFinalize: false,
        errors,
        warnings,
        analysis: this.getEmptyInputAnalysis(),
      });
    }

    // Validate UTXO presence
    if (!input.witnessUtxo && !input.nonWitnessUtxo) {
      errors.push({
        rule: 'missing_utxo',
        message: `Input ${inputIndex} missing UTXO information`,
        index: inputIndex,
        severity: 'critical',
        suggestion: 'Add witnessUtxo or nonWitnessUtxo',
      });
    }

    // Validate signatures
    this.validateInputSignatures(input, inputIndex, errors, warnings);

    // Validate scripts
    this.validateInputScripts(input, inputIndex, errors, warnings);

    // Validate sequence numbers
    this.validateSequenceNumber(
      txInput.sequence ?? 0xffffffff,
      inputIndex,
      warnings,
    );

    // Generate input analysis
    const analysis = this.analyzeInput(psbt, inputIndex);

    return Promise.resolve({
      index: inputIndex,
      valid: errors.filter((e) => e.severity === 'critical').length === 0,
      canFinalize: this.canFinalizeInput(psbt, inputIndex),
      errors,
      warnings,
      analysis,
    });
  }

  /**
   * Validate specific output
   */
  validateOutput(
    psbt: Psbt,
    outputIndex: number,
  ): Promise<OutputValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (outputIndex >= psbt.txOutputs.length) {
      errors.push({
        rule: 'output_index_bounds',
        message: `Output index ${outputIndex} out of bounds`,
        index: outputIndex,
        severity: 'critical',
      });

      return Promise.resolve({
        index: outputIndex,
        valid: false,
        errors,
        warnings,
        analysis: this.getEmptyOutputAnalysis(),
      });
    }

    const output = psbt.data.outputs[outputIndex];
    const txOutput = psbt.txOutputs[outputIndex];

    if (!txOutput) {
      errors.push({
        rule: 'output_missing',
        message: `Output data missing for index ${outputIndex}`,
        index: outputIndex,
        severity: 'critical',
      });

      return Promise.resolve({
        index: outputIndex,
        valid: false,
        errors,
        warnings,
        analysis: this.getEmptyOutputAnalysis(),
      });
    }

    // Validate output value
    this.validateOutputValue(txOutput.value, outputIndex, errors, warnings);

    // Validate output script
    this.validateOutputScript(txOutput.script, outputIndex, errors, warnings);

    // Validate derivation paths
    if (output?.bip32Derivation) {
      this.validateBIP32Derivation(
        output.bip32Derivation,
        outputIndex,
        warnings,
      );
    }

    // Generate output analysis
    const analysis = this.analyzeOutput(psbt, outputIndex);

    return Promise.resolve({
      index: outputIndex,
      valid: errors.filter((e) => e.severity === 'critical').length === 0,
      errors,
      warnings,
      analysis,
    });
  }

  /**
   * Check if PSBT can be finalized
   */
  canFinalize(psbt: Psbt): Promise<boolean> {
    try {
      for (let i = 0; i < psbt.inputCount; i++) {
        if (!this.canFinalizeInput(psbt, i)) {
          return Promise.resolve(false);
        }
      }
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }

  /**
   * Get missing components for finalization
   */
  getMissingComponents(psbt: Psbt): Promise<
    Array<{
      inputIndex: number;
      missing: string[];
    }>
  > {
    const missing: Array<{ inputIndex: number; missing: string[] }> = [];

    for (let i = 0; i < psbt.inputCount; i++) {
      const inputMissing = this.getMissingInputComponents(psbt, i);
      if (inputMissing.length > 0) {
        missing.push({
          inputIndex: i,
          missing: inputMissing,
        });
      }
    }

    return Promise.resolve(missing);
  }

  /**
   * Analyze PSBT structure and completeness
   */
  async analyze(psbt: Psbt): Promise<PSBTAnalysisReport> {
    const validation = await this.validate(psbt);
    const finalizationReadiness = await this.getFinalizationReadiness(psbt);
    const security = this.analyzeSecurityRisks(psbt, validation);
    const compatibility = this.analyzeCompatibility(psbt);

    const completionPercentage = this.calculateCompletionPercentage(psbt);

    return {
      summary: {
        valid: validation.valid,
        canFinalize: validation.canFinalize,
        completionPercentage,
        estimatedFee: validation.transactionAnalysis.fee,
        estimatedFeeRate: validation.transactionAnalysis.feeRate,
      },
      validation,
      finalization: finalizationReadiness,
      security,
      compatibility,
    };
  }

  // Private helper methods

  private initializeValidationRules(): Map<string, PSBTValidationRule> {
    const _rules = new Map<string, PSBTValidationRule>();

    // Add validation rules
    _rules.set('psbt_structure', {
      name: 'psbt_structure',
      description: 'PSBT has valid structure',
      category: 'structure',
      critical: true,
    });

    _rules.set('input_utxo', {
      name: 'input_utxo',
      description: 'All inputs have UTXO information',
      category: 'structure',
      critical: true,
    });

    _rules.set('signature_validation', {
      name: 'signature_validation',
      description: 'All signatures are valid',
      category: 'signature',
      critical: true,
    });

    _rules.set('script_validation', {
      name: 'script_validation',
      description: 'All scripts are valid',
      category: 'script',
      critical: true,
    });

    _rules.set('fee_validation', {
      name: 'fee_validation',
      description: 'Transaction fee is reasonable',
      category: 'fee',
      critical: false,
    });

    return _rules;
  }

  private validatePSBTStructure(
    psbt: Psbt,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    passed: string[],
  ): Promise<void> {
    // Validate version
    if (psbt.version < 1 || psbt.version > 2) {
      warnings.push({
        rule: 'version_compatibility',
        message: `Unusual transaction version: ${psbt.version}`,
        recommendation: 'Consider using version 2',
      });
    }

    // Validate input/output counts
    if (psbt.inputCount === 0) {
      errors.push({
        rule: 'no_inputs',
        message: 'PSBT has no inputs',
        severity: 'critical',
      });
    }

    if (psbt.txOutputs.length === 0) {
      errors.push({
        rule: 'no_outputs',
        message: 'PSBT has no outputs',
        severity: 'critical',
      });
    }

    passed.push('psbt_structure');
    return Promise.resolve();
  }

  private validateTransactionLevel_func(
    psbt: Psbt,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    passed: string[],
  ): Promise<void> {
    void errors; // Mark as intentionally unused
    // Validate locktime
    if (psbt.locktime > 0 && psbt.locktime < 500000000) {
      // Block height locktime
      warnings.push({
        rule: 'block_locktime',
        message: `Transaction locked until block ${psbt.locktime}`,
      });
    } else if (psbt.locktime >= 500000000) {
      // Timestamp locktime
      const lockDate = new Date(psbt.locktime * 1000);
      warnings.push({
        rule: 'time_locktime',
        message: `Transaction locked until ${lockDate.toISOString()}`,
      });
    }

    // Validate fee
    try {
      const fee = this.calculateFee(psbt);
      const size = this.estimateTransactionSize(psbt);
      const feeRate = fee / size;

      if (feeRate < 1) {
        warnings.push({
          rule: 'low_fee_rate',
          message: `Low fee rate: ${feeRate.toFixed(2)} sat/vB`,
          recommendation: 'Consider increasing fee for faster confirmation',
        });
      }

      if (feeRate > 1000) {
        warnings.push({
          rule: 'high_fee_rate',
          message: `Very high fee rate: ${feeRate.toFixed(2)} sat/vB`,
          recommendation: 'Verify fee is intentional',
        });
      }
    } catch {
      warnings.push({
        rule: 'fee_calculation',
        message: 'Unable to calculate fee - missing UTXO information',
      });
    }

    passed.push('transaction_level');
    return Promise.resolve();
  }

  private validateInputSignatures(
    input: any,
    inputIndex: number,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const signatures = input.partialSig || [];

    if (signatures.length === 0) {
      warnings.push({
        rule: 'no_signatures',
        message: `Input ${inputIndex} has no signatures`,
        index: inputIndex,
        recommendation: 'Sign input before finalizing',
      });
      return;
    }

    // Validate signature format
    for (const sig of signatures) {
      if (
        !Buffer.isBuffer(sig.signature) ||
        sig.signature.length < 8 ||
        sig.signature.length > 73
      ) {
        errors.push({
          rule: 'invalid_signature',
          message: `Invalid signature format for input ${inputIndex}`,
          index: inputIndex,
          severity: 'high',
        });
      }

      if (
        !Buffer.isBuffer(sig.pubkey) ||
        (sig.pubkey.length !== 33 && sig.pubkey.length !== 65)
      ) {
        errors.push({
          rule: 'invalid_pubkey',
          message: `Invalid public key format for input ${inputIndex}`,
          index: inputIndex,
          severity: 'high',
        });
      }
    }
  }

  private validateInputScripts(
    input: any,
    inputIndex: number,
    errors: ValidationError[],
    _warnings: ValidationWarning[],
  ): void {
    // Check for required scripts based on input type
    if (input.redeemScript && input.redeemScript.length === 0) {
      errors.push({
        rule: 'empty_redeem_script',
        message: `Empty redeem script for input ${inputIndex}`,
        index: inputIndex,
        severity: 'high',
      });
    }

    if (input.witnessScript && input.witnessScript.length === 0) {
      errors.push({
        rule: 'empty_witness_script',
        message: `Empty witness script for input ${inputIndex}`,
        index: inputIndex,
        severity: 'high',
      });
    }
  }

  private validateSequenceNumber(
    sequence: number,
    inputIndex: number,
    warnings: ValidationWarning[],
  ): void {
    if (sequence < 0xfffffffe) {
      warnings.push({
        rule: 'rbf_enabled',
        message: `Input ${inputIndex} signals RBF (Replace-By-Fee)`,
        index: inputIndex,
      });
    }

    if (sequence < 0xf0000000) {
      warnings.push({
        rule: 'csv_timelock',
        message: `Input ${inputIndex} has CSV (CheckSequenceVerify) timelock`,
        index: inputIndex,
      });
    }
  }

  private validateOutputValue(
    value: number,
    outputIndex: number,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    if (value < 0) {
      errors.push({
        rule: 'negative_output_value',
        message: `Output ${outputIndex} has negative value`,
        index: outputIndex,
        severity: 'critical',
      });
    }

    if (value > 0 && value < 546) {
      warnings.push({
        rule: 'dust_output',
        message: `Output ${outputIndex} is dust (${value} sat)`,
        index: outputIndex,
        recommendation: 'Consider consolidating with other outputs',
      });
    }
  }

  private validateOutputScript(
    script: Buffer,
    outputIndex: number,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    if (script.length === 0) {
      errors.push({
        rule: 'empty_output_script',
        message: `Output ${outputIndex} has empty script`,
        index: outputIndex,
        severity: 'critical',
      });
      return;
    }

    // Basic script validation
    try {
      bitcoin.address.fromOutputScript(script, this.network);
      // If we can extract an address, the script is likely valid
    } catch {
      // Check if it's an OP_RETURN script
      if (script[0] === 0x6a) {
        // OP_RETURN is valid
        if (script.length > 83) {
          warnings.push({
            rule: 'large_op_return',
            message: `Output ${outputIndex} has large OP_RETURN (${script.length} bytes)`,
            index: outputIndex,
          });
        }
      } else {
        warnings.push({
          rule: 'unrecognized_script',
          message: `Output ${outputIndex} has unrecognized script type`,
          index: outputIndex,
        });
      }
    }
  }

  private validateBIP32Derivation(
    derivations: any[],
    index: number,
    warnings: ValidationWarning[],
  ): void {
    for (const derivation of derivations) {
      if (!derivation.path || !derivation.path.startsWith('m/')) {
        warnings.push({
          rule: 'invalid_derivation_path',
          message: `Invalid BIP32 derivation path at index ${index}`,
          index,
        });
      }
    }
  }

  private canFinalizeInput(psbt: Psbt, inputIndex: number): boolean {
    try {
      const input = psbt.data.inputs[inputIndex];
      if (!input) return false;

      // Check for basic requirements
      if (!input.witnessUtxo && !input.nonWitnessUtxo) return false;
      if (!input.partialSig || input.partialSig.length === 0) return false;

      // Additional checks based on script type would go here
      return true;
    } catch {
      return false;
    }
  }

  private getMissingInputComponents(psbt: Psbt, inputIndex: number): string[] {
    const missing: string[] = [];
    const input = psbt.data.inputs[inputIndex];

    if (!input) {
      missing.push('input_data');
      return missing;
    }

    if (!input.witnessUtxo && !input.nonWitnessUtxo) {
      missing.push('utxo_information');
    }

    if (!input.partialSig || input.partialSig.length === 0) {
      missing.push('signatures');
    }

    // Check for scripts based on UTXO type
    if (input.witnessUtxo) {
      const script = input.witnessUtxo.script;
      if (this.isP2SH(script) && !input.redeemScript) {
        missing.push('redeem_script');
      }
      if (this.isP2WSH(script) && !input.witnessScript) {
        missing.push('witness_script');
      }
    }

    return missing;
  }

  private analyzeInput(psbt: Psbt, inputIndex: number): InputAnalysis {
    const input = psbt.data.inputs[inputIndex];
    if (!input) return this.getEmptyInputAnalysis();

    const analysis: InputAnalysis = {
      inputType: this.detectInputType(input),
      hasWitnessUtxo: !!input.witnessUtxo,
      hasNonWitnessUtxo: !!input.nonWitnessUtxo,
      hasRedeemScript: !!input.redeemScript,
      hasWitnessScript: !!input.witnessScript,
      signaturesCount: input.partialSig?.length || 0,
      signaturesRequired: this.getRequiredSignatures(input),
      derivationPathsCount: input.bip32Derivation?.length || 0,
      sighashTypes: this.extractSighashTypes(input),
      estimatedSize: this.estimateInputSize(input),
    };

    return analysis;
  }

  private analyzeOutput(psbt: Psbt, outputIndex: number): OutputAnalysis {
    const output = psbt.data.outputs[outputIndex];
    const txOutput = psbt.txOutputs[outputIndex];

    if (!txOutput) return this.getEmptyOutputAnalysis();

    const extractedAddress = this.extractAddress(txOutput.script);
    const analysis: OutputAnalysis = {
      outputType: this.detectOutputType(txOutput.script),
      value: txOutput.value,
      isChange: this.isChangeOutput(output, outputIndex),
      aboveDustThreshold: txOutput.value >= 546,
      derivationPathsCount: output?.bip32Derivation?.length || 0,
    };

    if (extractedAddress) {
      analysis.address = extractedAddress;
    }

    return analysis;
  }

  private analyzeTransaction(psbt: Psbt): TransactionAnalysis {
    const totalInputValue = this.calculateTotalInputValue(psbt);
    const totalOutputValue = this.calculateTotalOutputValue(psbt);
    const fee = Math.max(0, totalInputValue - totalOutputValue);
    const estimatedSize = this.estimateTransactionSize(psbt);
    const feeRate = estimatedSize > 0 ? fee / estimatedSize : 0;

    return {
      version: psbt.version,
      locktime: psbt.locktime,
      inputCount: psbt.inputCount,
      outputCount: psbt.txOutputs.length,
      totalInputValue,
      totalOutputValue,
      fee,
      feeRate,
      estimatedSize,
      rbfEnabled: this.isRBFEnabled(psbt),
      isSegwit: this.isSegwitTransaction(psbt),
      complexityScore: this.calculateComplexityScore(psbt),
    };
  }

  private getFinalizationReadiness(psbt: Psbt): Promise<{
    ready: boolean;
    readyInputs: number[];
    blockedInputs: Array<
      { index: number; reason: string; missingComponents: string[] }
    >;
  }> {
    const readyInputs: number[] = [];
    const blockedInputs: Array<
      { index: number; reason: string; missingComponents: string[] }
    > = [];

    for (let i = 0; i < psbt.inputCount; i++) {
      if (this.canFinalizeInput(psbt, i)) {
        readyInputs.push(i);
      } else {
        const missing = this.getMissingInputComponents(psbt, i);
        blockedInputs.push({
          index: i,
          reason: `Missing: ${missing.join(', ')}`,
          missingComponents: missing,
        });
      }
    }

    return Promise.resolve({
      ready: blockedInputs.length === 0,
      readyInputs,
      blockedInputs,
    });
  }

  private analyzeSecurityRisks(
    _psbt: Psbt,
    validation: PSBTValidationResult,
  ): {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    risks: string[];
    recommendations: string[];
  } {
    const risks: string[] = [];
    const recommendations: string[] = [];

    // High fee risk
    if (validation.transactionAnalysis.feeRate > 100) {
      risks.push('Very high fee rate');
      recommendations.push('Verify fee is intentional');
    }

    // Large transaction risk
    if (validation.transactionAnalysis.estimatedSize > 100000) {
      risks.push('Large transaction size may cause relay issues');
      recommendations.push('Consider breaking into smaller transactions');
    }

    // Complexity risk
    if (validation.transactionAnalysis.complexityScore > 8) {
      risks.push('Complex transaction structure');
      recommendations.push('Review transaction carefully before broadcasting');
    }

    const riskLevel = this.calculateRiskLevel(
      risks.length,
      validation.criticalErrors.length,
    );

    return {
      riskLevel,
      risks,
      recommendations,
    };
  }

  private analyzeCompatibility(psbt: Psbt): {
    bitcoinjsLib: boolean;
    bip174: boolean;
  } {
    return {
      bitcoinjsLib: true, // Assuming compatibility since we're using bitcoinjs-lib
      bip174: this.checkBIP174Compliance(psbt),
    };
  }

  // Helper methods with basic implementations

  private calculateFee(psbt: Psbt): number {
    const inputValue = this.calculateTotalInputValue(psbt);
    const outputValue = this.calculateTotalOutputValue(psbt);
    return Math.max(0, inputValue - outputValue);
  }

  private calculateTotalInputValue(psbt: Psbt): number {
    let total = 0;
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      if (input?.witnessUtxo) {
        total += input.witnessUtxo.value;
      }
      // Note: For non-witness UTXO, we'd need to parse the transaction
    }
    return total;
  }

  private calculateTotalOutputValue(psbt: Psbt): number {
    let total = 0;
    for (let i = 0; i < psbt.txOutputs.length; i++) {
      const output = psbt.txOutputs[i];
      if (output) {
        total += output.value;
      }
    }
    return total;
  }

  private estimateTransactionSize(psbt: Psbt): number {
    // Rough estimation
    const baseSize = 10;
    const inputSize = psbt.inputCount * 150;
    const outputSize = psbt.txOutputs.length * 34;
    return baseSize + inputSize + outputSize;
  }

  private calculateCompletionPercentage(psbt: Psbt): number {
    let totalRequired = 0;
    let totalPresent = 0;

    for (let i = 0; i < psbt.inputCount; i++) {
      totalRequired += 2; // UTXO + signature
      const input = psbt.data.inputs[i];
      if (input?.witnessUtxo || input?.nonWitnessUtxo) totalPresent++;
      if (input?.partialSig && input.partialSig.length > 0) totalPresent++;
    }

    return totalRequired > 0 ? (totalPresent / totalRequired) * 100 : 0;
  }

  // Simple helper implementations
  private detectInputType(input: any): InputAnalysis['inputType'] {
    if (input.witnessScript) return 'P2WSH';
    if (input.redeemScript) return 'P2SH';
    if (input.witnessUtxo) return 'P2WPKH';
    return 'P2PKH';
  }

  private detectOutputType(script: Buffer): OutputAnalysis['outputType'] {
    if (script[0] === 0x6a) return 'OP_RETURN';
    if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14) {
      return 'P2WPKH';
    }
    if (script.length === 34 && script[0] === 0x00 && script[1] === 0x20) {
      return 'P2WSH';
    }
    if (script.length === 23 && script[0] === 0xa9 && script[22] === 0x87) {
      return 'P2SH';
    }
    if (script.length === 25 && script[0] === 0x76 && script[1] === 0xa9) {
      return 'P2PKH';
    }
    return 'unknown';
  }

  private getRequiredSignatures(_input: any): number {
    // This would need script analysis for multisig
    return 1;
  }

  private extractSighashTypes(input: any): number[] {
    const types: number[] = [];
    if (input.partialSig) {
      for (const sig of input.partialSig) {
        if (sig.signature && sig.signature.length > 0) {
          types.push(sig.signature[sig.signature.length - 1]);
        }
      }
    }
    return types;
  }

  private estimateInputSize(input: any): number {
    if (input.witnessScript) return 150;
    if (input.redeemScript) return 120;
    if (input.witnessUtxo) return 68;
    return 148;
  }

  private isChangeOutput(output: any, _index: number): boolean {
    return !!(output?.bip32Derivation && output.bip32Derivation.length > 0);
  }

  private extractAddress(script: Buffer): string | undefined {
    try {
      return bitcoin.address.fromOutputScript(script, this.network);
    } catch {
      return undefined;
    }
  }

  private isP2SH(script: Buffer): boolean {
    return script.length === 23 && script[0] === 0xa9 && script[22] === 0x87;
  }

  private isP2WSH(script: Buffer): boolean {
    return script.length === 34 && script[0] === 0x00 && script[1] === 0x20;
  }

  private isRBFEnabled(psbt: Psbt): boolean {
    for (let i = 0; i < psbt.inputCount; i++) {
      const sequence = psbt.txInputs[i]?.sequence ?? 0xffffffff;
      if (sequence < 0xfffffffe) return true;
    }
    return false;
  }

  private isSegwitTransaction(psbt: Psbt): boolean {
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      if (input?.witnessUtxo || input?.witnessScript) return true;
    }
    return false;
  }

  private calculateComplexityScore(psbt: Psbt): number {
    let score = 0;
    score += psbt.inputCount;
    score += psbt.txOutputs.length;

    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      if (input?.redeemScript) score += 2;
      if (input?.witnessScript) score += 2;
      if (input?.partialSig && input.partialSig.length > 1) {
        score += input.partialSig.length;
      }
    }

    return score;
  }

  private calculateRiskLevel(
    riskCount: number,
    criticalErrorCount: number,
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (criticalErrorCount > 0) return 'critical';
    if (riskCount >= 3) return 'high';
    if (riskCount >= 1) return 'medium';
    return 'low';
  }

  private checkBIP174Compliance(psbt: Psbt): boolean {
    // Basic BIP-174 compliance check
    try {
      psbt.toBase64(); // If this works, basic structure is compliant
      return true;
    } catch {
      return false;
    }
  }

  private _hasComplexScripts(psbt: Psbt): boolean {
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      if (
        input?.witnessScript ||
        (input?.redeemScript && input.redeemScript.length > 23)
      ) {
        return true;
      }
    }
    return false;
  }

  private getEmptyInputAnalysis(): InputAnalysis {
    return {
      inputType: 'unknown',
      hasWitnessUtxo: false,
      hasNonWitnessUtxo: false,
      hasRedeemScript: false,
      hasWitnessScript: false,
      signaturesCount: 0,
      signaturesRequired: 0,
      derivationPathsCount: 0,
      sighashTypes: [],
      estimatedSize: 0,
    };
  }

  private getEmptyOutputAnalysis(): OutputAnalysis {
    return {
      outputType: 'unknown',
      value: 0,
      isChange: false,
      aboveDustThreshold: false,
      derivationPathsCount: 0,
    };
  }

  private getEmptyTransactionAnalysis(): TransactionAnalysis {
    return {
      version: 0,
      locktime: 0,
      inputCount: 0,
      outputCount: 0,
      totalInputValue: 0,
      totalOutputValue: 0,
      fee: 0,
      feeRate: 0,
      estimatedSize: 0,
      rbfEnabled: false,
      isSegwit: false,
      complexityScore: 0,
    };
  }
}
