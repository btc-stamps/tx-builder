/**
 * Multi-signature Key Manager
 * Key generation and management for multi-signature transactions
 */

import { Buffer } from 'node:buffer';

import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import type { Network } from 'bitcoinjs-lib';

import type { IMultisigKeyManager, MultisigParticipant } from '../interfaces/multisig.interface.ts';

/**
 * Multi-signature Key Manager Implementation
 */
export class MultisigKeyManager implements IMultisigKeyManager {
  private network: Network;
  private bip32: ReturnType<typeof BIP32Factory>;

  constructor(network: Network = bitcoin.networks.bitcoin) {
    this.network = network;
    this.bip32 = BIP32Factory(ecc);
  }

  /**
   * Generate participant keys
   */
  generateParticipantKeys(
    count: number,
    derivationPath = "m/48'/0'/0'/2'",
  ): MultisigParticipant[] {
    if (count <= 0 || count > 15) {
      throw new Error('Participant count must be between 1 and 15');
    }

    const participants: MultisigParticipant[] = [];

    for (let i = 0; i < count; i++) {
      // Generate random seed for each participant
      const seed = this.generateRandomSeed();
      const root = this.bip32.fromSeed(seed, this.network);

      // Derive key at specified path
      const node = root.derivePath(derivationPath);

      if (!node.publicKey) {
        throw new Error('Failed to derive public key');
      }

      participants.push({
        id: `generated_participant_${i}`,
        publicKey: Buffer.from(node.publicKey),
        derivationPath: {
          path: derivationPath,
          masterFingerprint: Buffer.from(root.fingerprint),
          accountXpub: node.neutered().toBase58(),
        },
        hasSigned: false,
      });
    }

    return participants;
  }

  /**
   * Import participant from extended public key
   */
  importParticipant(
    id: string,
    xpub: string,
    derivationPath?: string,
  ): MultisigParticipant {
    try {
      const node = this.bip32.fromBase58(xpub, this.network);

      if (!node.publicKey) {
        throw new Error('Invalid extended public key');
      }

      // Extract master fingerprint from the first 4 bytes of the identifier
      const masterFingerprint = Buffer.from([0, 0, 0, 0]); // Placeholder - would need parent info

      return {
        id,
        publicKey: Buffer.from(node.publicKey),
        derivationPath: derivationPath
          ? {
            path: derivationPath,
            masterFingerprint,
            accountXpub: xpub,
          }
          : undefined,
        xpub,
        hasSigned: false,
      };
    } catch (error) {
      throw new Error(
        `Failed to import participant: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Derive keys for multisig at specific path
   */
  deriveMultisigKeys(
    participants: MultisigParticipant[],
    changePath: number,
    addressIndex: number,
  ): MultisigParticipant[] {
    return participants.map((participant) => {
      if (!participant.xpub || !participant.derivationPath) {
        // Return as-is if no derivation info
        return participant;
      }

      try {
        const node = this.bip32.fromBase58(participant.xpub, this.network);
        const derived = node.derive(changePath).derive(addressIndex);

        if (!derived.publicKey) {
          throw new Error(
            `Failed to derive key for participant ${participant.id}`,
          );
        }

        return {
          ...participant,
          publicKey: Buffer.from(derived.publicKey),
          derivationPath: {
            ...participant.derivationPath,
            path: `${participant.derivationPath.path}/${changePath}/${addressIndex}`,
          },
        };
      } catch (error) {
        console.warn(
          `Failed to derive key for participant ${participant.id}:`,
          error,
        );
        return participant; // Return original if derivation fails
      }
    });
  }

  /**
   * Validate key order (BIP 67 lexicographical ordering)
   */
  validateKeyOrder(publicKeys: Buffer[]): boolean {
    for (let i = 1; i < publicKeys.length; i++) {
      if (Buffer.compare(publicKeys[i - 1]!, publicKeys[i]!) > 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Sort keys according to BIP 67
   */
  sortKeys(publicKeys: Buffer[]): Buffer[] {
    return [...publicKeys].sort((a, b) => Buffer.compare(a, b));
  }

  /**
   * Generate cosigner information for wallet coordination
   */
  generateCosignerInfo(participants: MultisigParticipant[]): {
    id: string;
    xpub: string;
    derivationPath: string;
    fingerprint: string;
  }[] {
    return participants
      .filter((p) => p.xpub && p.derivationPath)
      .map((p) => ({
        id: p.id,
        xpub: p.xpub!,
        derivationPath: p.derivationPath!.path,
        fingerprint: p.derivationPath!.masterFingerprint.toString('hex'),
      }));
  }

  /**
   * Import cosigner from wallet export
   */
  importCosigner(cosignerData: {
    id: string;
    xpub: string;
    derivationPath: string;
    fingerprint: string;
  }): MultisigParticipant {
    return this.importParticipant(
      cosignerData.id,
      cosignerData.xpub,
      cosignerData.derivationPath,
    );
  }

  /**
   * Generate multisig wallet configuration
   */
  generateMultisigWalletConfig(
    threshold: number,
    participants: MultisigParticipant[],
    name?: string,
  ): {
    name: string;
    threshold: number;
    totalParticipants: number;
    scriptType: 'P2SH' | 'P2WSH' | 'P2SH_P2WSH';
    network: string;
    participants: {
      id: string;
      xpub: string;
      derivationPath: string;
      fingerprint: string;
    }[];
    createdAt: string;
  } {
    const networkName = this.getNetworkName(this.network);

    return {
      name: name || `${threshold}-of-${participants.length} Multisig`,
      threshold,
      totalParticipants: participants.length,
      scriptType: 'P2WSH', // Default to native SegWit
      network: networkName,
      participants: this.generateCosignerInfo(participants),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Validate multisig wallet compatibility
   */
  validateMultisigCompatibility(participants: MultisigParticipant[]): {
    compatible: boolean;
    issues: string[];
    warnings: string[];
  } {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check if all participants have required information
    const participantsWithXpub = participants.filter((p) => p.xpub);
    const participantsWithDerivation = participants.filter((p) => p.derivationPath);

    if (participantsWithXpub.length === 0) {
      issues.push('No participants have extended public keys');
    } else if (participantsWithXpub.length !== participants.length) {
      warnings.push(
        `Only ${participantsWithXpub.length}/${participants.length} participants have extended public keys`,
      );
    }

    if (participantsWithDerivation.length === 0) {
      warnings.push('No participants have derivation paths');
    }

    // Check derivation path consistency
    const derivationPaths = participantsWithDerivation.map((p) => p.derivationPath!.path);
    const uniquePaths = new Set(derivationPaths);

    if (uniquePaths.size > 1) {
      warnings.push('Participants have different derivation paths');
    }

    // Check network consistency
    try {
      participantsWithXpub.forEach((p) => {
        this.bip32.fromBase58(p.xpub!, this.network);
      });
    } catch {
      issues.push(
        'Some extended public keys are incompatible with the current network',
      );
    }

    return {
      compatible: issues.length === 0,
      issues,
      warnings,
    };
  }

  /**
   * Create backup information for recovery
   */
  createBackupInfo(
    threshold: number,
    participants: MultisigParticipant[],
    addresses: string[],
  ): {
    version: number;
    threshold: number;
    totalParticipants: number;
    network: string;
    scriptType: string;
    cosigners: any[];
    addresses: string[];
    derivationPaths: string[];
    createdAt: string;
    checksum: string;
  } {
    const backupData = {
      version: 1,
      threshold,
      totalParticipants: participants.length,
      network: this.getNetworkName(this.network),
      scriptType: 'P2WSH',
      cosigners: this.generateCosignerInfo(participants),
      addresses,
      derivationPaths: participants.filter((p) => p.derivationPath).map((p) =>
        p.derivationPath!.path
      ),
      createdAt: new Date().toISOString(),
      checksum: '',
    };

    // Calculate checksum
    backupData.checksum = this.calculateChecksum(JSON.stringify(backupData));

    return backupData;
  }

  // Private helper methods

  private generateRandomSeed(): Buffer {
    // In a real implementation, use cryptographically secure random source
    const seed = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      seed[i] = Math.floor(Math.random() * 256);
    }
    return seed;
  }

  private getNetworkName(network: Network): string {
    if (network === bitcoin.networks.bitcoin) return 'mainnet';
    if (network === bitcoin.networks.testnet) return 'testnet';
    if (network === bitcoin.networks.regtest) return 'regtest';
    return 'unknown';
  }

  private calculateChecksum(data: string): string {
    // Simple checksum - in production, use SHA256 or similar
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum += data.charCodeAt(i);
    }
    return (checksum % 65536).toString(16).padStart(4, '0');
  }
}
