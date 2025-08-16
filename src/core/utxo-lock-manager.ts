/**
 * UTXO Lock Manager
 * Manages exclusive locks on UTXOs to prevent double-spending during RBF/CPFP operations
 */

import type { IUTXOLockManager, UTXOLock } from '../interfaces/rbf-cpfp.interface.ts';
import { UTXOLockError } from '../interfaces/rbf-cpfp.interface.ts';

/**
 * UTXO Lock Manager Implementation
 */
export class UTXOLockManager implements IUTXOLockManager {
  private locks = new Map<string, UTXOLock>(); // outpoint -> lock
  private lockIdToOutpoint = new Map<string, string>(); // lockId -> outpoint
  private defaultLockDuration = 30 * 60 * 1000; // 30 minutes in milliseconds

  /**
   * Lock UTXO for exclusive use
   */
  lockUTXO(
    outpoint: string,
    purpose: 'rbf' | 'cpfp' | 'pending',
    durationMs?: number,
  ): Promise<string> {
    // Check if already locked
    const existingLock = this.locks.get(outpoint);
    if (existingLock && existingLock.expiresAt > Date.now()) {
      throw new UTXOLockError(
        `UTXO ${outpoint} is already locked (purpose: ${existingLock.purpose}, expires: ${
          new Date(existingLock.expiresAt).toISOString()
        })`,
        'ALREADY_LOCKED',
        outpoint,
      );
    }

    // Generate unique lock ID
    const lockId = this.generateLockId();
    const duration = durationMs || this.defaultLockDuration;
    const expiresAt = Date.now() + duration;

    const lock: UTXOLock = {
      outpoint,
      expiresAt,
      purpose,
      lockId,
    };

    this.locks.set(outpoint, lock);
    this.lockIdToOutpoint.set(lockId, outpoint);

    return Promise.resolve(lockId);
  }

  /**
   * Unlock UTXO
   */
  unlockUTXO(lockId: string): Promise<boolean> {
    const outpoint = this.lockIdToOutpoint.get(lockId);

    if (!outpoint) {
      return Promise.resolve(false); // Lock ID not found
    }

    const lock = this.locks.get(outpoint);
    if (!lock || lock.lockId !== lockId) {
      return Promise.resolve(false); // Lock mismatch
    }

    this.locks.delete(outpoint);
    this.lockIdToOutpoint.delete(lockId);

    return Promise.resolve(true);
  }

  /**
   * Check if UTXO is locked
   */
  isLocked(outpoint: string): Promise<boolean> {
    const lock = this.locks.get(outpoint);

    if (!lock) {
      return Promise.resolve(false);
    }

    // Check if lock has expired
    if (lock.expiresAt <= Date.now()) {
      // Clean up expired lock
      this.locks.delete(outpoint);
      this.lockIdToOutpoint.delete(lock.lockId);
      return Promise.resolve(false);
    }

    return Promise.resolve(true);
  }

  /**
   * Get locked UTXOs
   */
  getLockedUTXOs(): Promise<UTXOLock[]> {
    // Clean up expired locks first
    this.clearExpiredLocks();

    return Promise.resolve(Array.from(this.locks.values()));
  }

  /**
   * Clear expired locks
   */
  clearExpiredLocks(): Promise<number> {
    const now = Date.now();
    let clearedCount = 0;

    const expiredOutpoints: string[] = [];

    for (const [outpoint, lock] of this.locks.entries()) {
      if (lock.expiresAt <= now) {
        expiredOutpoints.push(outpoint);
      }
    }

    for (const outpoint of expiredOutpoints) {
      const lock = this.locks.get(outpoint);
      if (lock) {
        this.locks.delete(outpoint);
        this.lockIdToOutpoint.delete(lock.lockId);
        clearedCount++;
      }
    }

    return Promise.resolve(clearedCount);
  }

  /**
   * Lock multiple UTXOs atomically
   */
  async lockMultiple(
    outpoints: string[],
    purpose: 'rbf' | 'cpfp' | 'pending',
    durationMs?: number,
  ): Promise<string[]> {
    // First, check if all UTXOs can be locked
    const conflictingLocks: string[] = [];

    for (const outpoint of outpoints) {
      if (await this.isLocked(outpoint)) {
        conflictingLocks.push(outpoint);
      }
    }

    if (conflictingLocks.length > 0) {
      throw new UTXOLockError(
        `Cannot lock UTXOs - the following are already locked: ${conflictingLocks.join(', ')}`,
        'MULTIPLE_CONFLICTS',
      );
    }

    // Lock all UTXOs
    const lockIds: string[] = [];
    const lockedOutpoints: string[] = [];

    try {
      for (const outpoint of outpoints) {
        const lockId = await this.lockUTXO(outpoint, purpose, durationMs);
        lockIds.push(lockId);
        lockedOutpoints.push(outpoint);
      }

      return lockIds;
    } catch (error) {
      // If any lock fails, unlock all previously locked UTXOs
      for (const lockId of lockIds) {
        await this.unlockUTXO(lockId);
      }
      throw error;
    }
  }

  /**
   * Extend lock duration
   */
  extendLock(lockId: string, additionalDurationMs: number): boolean {
    const outpoint = this.lockIdToOutpoint.get(lockId);

    if (!outpoint) {
      return false;
    }

    const lock = this.locks.get(outpoint);
    if (!lock || lock.lockId !== lockId) {
      return false;
    }

    // Extend the expiration time
    lock.expiresAt += additionalDurationMs;

    return true;
  }

  /**
   * Get lock information
   */
  getLockInfo(outpoint: string): UTXOLock | null {
    const lock = this.locks.get(outpoint);

    if (!lock) {
      return null;
    }

    // Check if expired
    if (lock.expiresAt <= Date.now()) {
      this.locks.delete(outpoint);
      this.lockIdToOutpoint.delete(lock.lockId);
      return null;
    }

    return { ...lock }; // Return copy to prevent mutation
  }

  /**
   * Get locks by purpose
   */
  getLocksByPurpose(purpose: 'rbf' | 'cpfp' | 'pending'): Promise<UTXOLock[]> {
    this.clearExpiredLocks();

    return Promise.resolve(
      Array.from(this.locks.values()).filter((lock) => lock.purpose === purpose),
    );
  }

  /**
   * Force unlock UTXO (admin function)
   */
  forceUnlock(outpoint: string): boolean {
    const lock = this.locks.get(outpoint);

    if (!lock) {
      return false;
    }

    this.locks.delete(outpoint);
    this.lockIdToOutpoint.delete(lock.lockId);

    return true;
  }

  /**
   * Check lock health and cleanup
   */
  async performMaintenance(): Promise<{
    totalLocks: number;
    expiredLocks: number;
    activeLocks: number;
    locksByPurpose: Record<string, number>;
  }> {
    const totalLocks = this.locks.size;
    const expiredLocks = await this.clearExpiredLocks();
    const activeLocks = this.locks.size;

    // Count locks by purpose
    const locksByPurpose: Record<string, number> = {};
    for (const lock of this.locks.values()) {
      locksByPurpose[lock.purpose] = (locksByPurpose[lock.purpose] || 0) + 1;
    }

    return Promise.resolve({
      totalLocks,
      expiredLocks,
      activeLocks,
      locksByPurpose,
    });
  }

  /**
   * Get lock statistics
   */
  async getStatistics(): Promise<{
    totalLocks: number;
    locksByPurpose: Record<string, number>;
    averageRemainingTime: number;
    upcomingExpirations: Array<
      { outpoint: string; expiresAt: number; purpose: string }
    >;
  }> {
    await this.clearExpiredLocks();

    const totalLocks = this.locks.size;
    const locksByPurpose: Record<string, number> = {};
    const now = Date.now();
    let totalRemainingTime = 0;

    const upcomingExpirations: Array<
      { outpoint: string; expiresAt: number; purpose: string }
    > = [];

    for (const lock of this.locks.values()) {
      locksByPurpose[lock.purpose] = (locksByPurpose[lock.purpose] || 0) + 1;

      const remainingTime = lock.expiresAt - now;
      totalRemainingTime += remainingTime;

      // Collect locks expiring in the next 5 minutes
      if (remainingTime < 5 * 60 * 1000) {
        upcomingExpirations.push({
          outpoint: lock.outpoint,
          expiresAt: lock.expiresAt,
          purpose: lock.purpose,
        });
      }
    }

    const averageRemainingTime = totalLocks > 0 ? totalRemainingTime / totalLocks : 0;

    // Sort upcoming expirations by expiration time
    upcomingExpirations.sort((a, b) => a.expiresAt - b.expiresAt);

    return Promise.resolve({
      totalLocks,
      locksByPurpose,
      averageRemainingTime,
      upcomingExpirations,
    });
  }

  // Private helper methods

  private generateLockId(): string {
    // Generate a unique lock ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `lock_${timestamp}_${random}`;
  }

  /**
   * Check if UTXOs are available for locking (not locked by others)
   */
  async checkAvailability(outpoints: string[]): Promise<{
    available: string[];
    locked: Array<{ outpoint: string; lock: UTXOLock }>;
  }> {
    const available: string[] = [];
    const locked: Array<{ outpoint: string; lock: UTXOLock }> = [];

    for (const outpoint of outpoints) {
      const isCurrentlyLocked = await this.isLocked(outpoint);

      if (isCurrentlyLocked) {
        const lockInfo = this.getLockInfo(outpoint);
        if (lockInfo) {
          locked.push({ outpoint, lock: lockInfo });
        }
      } else {
        available.push(outpoint);
      }
    }

    return Promise.resolve({ available, locked });
  }

  /**
   * Batch unlock multiple locks
   */
  async unlockMultiple(lockIds: string[]): Promise<{
    successful: string[];
    failed: string[];
  }> {
    const successful: string[] = [];
    const failed: string[] = [];

    for (const lockId of lockIds) {
      const success = await this.unlockUTXO(lockId);
      if (success) {
        successful.push(lockId);
      } else {
        failed.push(lockId);
      }
    }

    return Promise.resolve({ successful, failed });
  }
}
