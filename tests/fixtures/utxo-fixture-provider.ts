/**
 * UTXO Fixture Provider - DI-friendly UTXO provider for testing
 *
 * Provides consistent, injectable UTXO sets based on realUTXOFixtures
 * for reliable and maintainable testing across all test suites.
 */

import type { UTXO } from '../../src/interfaces/provider.interface';
import { realUTXOFixtures } from '../../test-fixtures/realUTXOFixtures';

export interface UTXOTestSet {
  name: string;
  description: string;
  utxos: UTXO[];
  totalValue: number;
  characteristics: string[];
}

/**
 * Creates a standardized UTXO from fixture data
 */
function createUTXOFromFixture(
  fixtureKey: string,
  fixtureData: any,
  confirmations: number = 6,
): UTXO {
  return {
    txid: fixtureData.txid,
    vout: fixtureData.vout,
    value: fixtureData.value,
    scriptPubKey: fixtureData.script,
    confirmations,
  };
}

/**
 * Standard UTXO test sets for consistent testing
 */
export class UTXOFixtureProvider {
  /**
   * Diverse value set - mixed script types, various values
   */
  static getDiverseSet(): UTXOTestSet {
    const utxos = [
      createUTXOFromFixture(
        'real_67230_33e794d0',
        realUTXOFixtures.p2tr.real_67230_33e794d0,
        10,
      ),
      createUTXOFromFixture(
        'real_7920_5df5adce',
        realUTXOFixtures.p2tr.real_7920_5df5adce,
        8,
      ),
      createUTXOFromFixture(
        'real_5000_e9e3950b',
        realUTXOFixtures.p2pkh.real_5000_e9e3950b,
        6,
      ),
      createUTXOFromFixture(
        'real_4700_d94ed52d',
        realUTXOFixtures.p2pkh.real_4700_d94ed52d,
        4,
      ),
      createUTXOFromFixture(
        'real_1000_b89dcfce',
        realUTXOFixtures.p2wpkh.real_1000_b89dcfce,
        6,
      ),
      createUTXOFromFixture(
        'real_811_c9933a04',
        realUTXOFixtures.p2wpkh.real_811_c9933a04,
        3,
      ),
    ];

    return {
      name: 'diverse',
      description: 'Mixed script types with various values (811-67230 sats)',
      utxos,
      totalValue: utxos.reduce((sum, u) => sum + u.value, 0),
      characteristics: [
        'mixed_script_types',
        'wide_value_range',
        'varied_confirmations',
      ],
    };
  }

  /**
   * Small value set - for dust and minimal transaction testing
   */
  static getSmallValueSet(): UTXOTestSet {
    const utxos = [
      createUTXOFromFixture(
        'real_1000_b89dcfce',
        realUTXOFixtures.p2wpkh.real_1000_b89dcfce,
        6,
      ),
      createUTXOFromFixture(
        'real_811_c9933a04',
        realUTXOFixtures.p2wpkh.real_811_c9933a04,
        3,
      ),
      createUTXOFromFixture(
        'real_1000_5e9883eb',
        realUTXOFixtures.p2pkh.real_1000_5e9883eb,
        5,
      ),
    ];

    return {
      name: 'small_values',
      description: 'Small value UTXOs for dust handling tests (811-1000 sats)',
      utxos,
      totalValue: utxos.reduce((sum, u) => sum + u.value, 0),
      characteristics: ['small_values', 'dust_proximity', 'limited_selection'],
    };
  }

  /**
   * High value set - for stamp protection and large transaction testing
   */
  static getHighValueSet(): UTXOTestSet {
    const utxos = [
      createUTXOFromFixture(
        'real_67230_33e794d0',
        realUTXOFixtures.p2tr.real_67230_33e794d0,
        10,
      ),
      createUTXOFromFixture(
        'real_7920_5df5adce',
        realUTXOFixtures.p2tr.real_7920_5df5adce,
        8,
      ),
      createUTXOFromFixture(
        'real_5000_e9e3950b',
        realUTXOFixtures.p2pkh.real_5000_e9e3950b,
        6,
      ),
      createUTXOFromFixture(
        'real_4700_d94ed52d',
        realUTXOFixtures.p2pkh.real_4700_d94ed52d,
        4,
      ),
    ];

    return {
      name: 'high_values',
      description: 'Higher value UTXOs for stamp protection testing (4700-67230 sats)',
      utxos,
      totalValue: utxos.reduce((sum, u) => sum + u.value, 0),
      characteristics: [
        'high_values',
        'stamp_candidates',
        'protection_testing',
      ],
    };
  }

  /**
   * Script type specific sets
   */
  static getP2WPKHSet(): UTXOTestSet {
    const utxos = [
      createUTXOFromFixture(
        'real_1000_b89dcfce',
        realUTXOFixtures.p2wpkh.real_1000_b89dcfce,
        6,
      ),
      createUTXOFromFixture(
        'real_811_c9933a04',
        realUTXOFixtures.p2wpkh.real_811_c9933a04,
        3,
      ),
    ];

    return {
      name: 'p2wpkh_only',
      description: 'P2WPKH UTXOs only for script-specific testing',
      utxos,
      totalValue: utxos.reduce((sum, u) => sum + u.value, 0),
      characteristics: ['single_script_type', 'p2wpkh', 'segwit'],
    };
  }

  static getP2TRSet(): UTXOTestSet {
    const utxos = [
      createUTXOFromFixture(
        'real_67230_33e794d0',
        realUTXOFixtures.p2tr.real_67230_33e794d0,
        10,
      ),
      createUTXOFromFixture(
        'real_7920_5df5adce',
        realUTXOFixtures.p2tr.real_7920_5df5adce,
        8,
      ),
    ];

    return {
      name: 'p2tr_only',
      description: 'P2TR (Taproot) UTXOs only for advanced script testing',
      utxos,
      totalValue: utxos.reduce((sum, u) => sum + u.value, 0),
      characteristics: ['single_script_type', 'p2tr', 'taproot'],
    };
  }

  /**
   * Confirmation-based sets
   */
  static getLowConfirmationSet(): UTXOTestSet {
    const utxos = [
      createUTXOFromFixture(
        'real_811_c9933a04',
        realUTXOFixtures.p2wpkh.real_811_c9933a04,
        1,
      ),
      createUTXOFromFixture(
        'real_4700_d94ed52d',
        realUTXOFixtures.p2pkh.real_4700_d94ed52d,
        2,
      ),
      createUTXOFromFixture(
        'real_1000_b89dcfce',
        realUTXOFixtures.p2wpkh.real_1000_b89dcfce,
        1,
      ),
    ];

    return {
      name: 'low_confirmations',
      description: 'UTXOs with low confirmation counts (1-2 confirmations)',
      utxos,
      totalValue: utxos.reduce((sum, u) => sum + u.value, 0),
      characteristics: [
        'low_confirmations',
        'recent_transactions',
        'confirmation_filtering',
      ],
    };
  }

  /**
   * Get all available test sets
   */
  static getAllSets(): UTXOTestSet[] {
    return [
      this.getDiverseSet(),
      this.getSmallValueSet(),
      this.getHighValueSet(),
      this.getP2WPKHSet(),
      this.getP2TRSet(),
      this.getLowConfirmationSet(),
    ];
  }

  /**
   * Get set by name for easy DI
   */
  static getSet(name: string): UTXOTestSet {
    const sets = {
      diverse: this.getDiverseSet,
      small_values: this.getSmallValueSet,
      high_values: this.getHighValueSet,
      p2wpkh_only: this.getP2WPKHSet,
      p2tr_only: this.getP2TRSet,
      low_confirmations: this.getLowConfirmationSet,
    };

    const setFn = sets[name as keyof typeof sets];
    if (!setFn) {
      throw new Error(
        `Unknown UTXO test set: ${name}. Available: ${Object.keys(sets).join(', ')}`,
      );
    }

    return setFn();
  }

  /**
   * Create custom set with specific characteristics
   */
  static createCustomSet(
    name: string,
    description: string,
    fixtureKeys: string[],
    confirmations?: number[],
  ): UTXOTestSet {
    const utxos: UTXO[] = [];

    fixtureKeys.forEach((key, index) => {
      const conf = confirmations?.[index] ?? 6;

      // Find fixture in any category
      for (const category of ['p2wpkh', 'p2pkh', 'p2tr']) {
        const fixtures = realUTXOFixtures[category as keyof typeof realUTXOFixtures];
        if (fixtures[key]) {
          utxos.push(createUTXOFromFixture(key, fixtures[key], conf));
          break;
        }
      }
    });

    return {
      name,
      description,
      utxos,
      totalValue: utxos.reduce((sum, u) => sum + u.value, 0),
      characteristics: ['custom'],
    };
  }
}
