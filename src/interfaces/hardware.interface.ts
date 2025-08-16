/**
 * Hardware Wallet Interface Definitions
 */

import type { Network, Psbt } from 'bitcoinjs-lib';
import { Buffer } from 'node:buffer';

export interface DerivationPath {
  /** Master key fingerprint */
  masterFingerprint: Buffer;
  /** BIP32 derivation path */
  path: string;
}

export interface SignPsbtOptions {
  /** PSBT to sign */
  psbt: Psbt;
  /** Input indices to sign */
  inputIndices: number[];
  /** Derivation paths for each input */
  derivationPaths: DerivationPath[];
  /** Bitcoin network */
  network: Network;
}

export interface SigningError {
  /** Input index that failed */
  inputIndex: number;
  /** Error message */
  error: string;
}

export interface SignPsbtResult {
  /** Signed PSBT */
  psbt: Psbt;
  /** Any signing errors */
  errors?: SigningError[];
}

export interface IHardwareWallet {
  /**
   * Sign a PSBT with the hardware wallet
   */
  signPsbt(options: SignPsbtOptions): Promise<SignPsbtResult>;

  /**
   * Get extended public key for a derivation path
   */
  getExtendedPublicKey(path: string): Promise<string>;

  /**
   * Get device information
   */
  getDeviceInfo(): Promise<{
    model: string;
    version: string;
    fingerprint: Buffer;
  }>;

  /**
   * Check if device is connected and ready
   */
  isReady(): Promise<boolean>;
}
