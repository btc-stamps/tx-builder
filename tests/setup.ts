/**
 * Global test setup for all test suites
 * Initializes required libraries, configurations, and global mocks
 */

import { vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

import { mockFetch } from './mocks/mockFeeProvider';
import { createMockNetworkProvider } from './mocks/mockNetworkProvider';
import { createMockOrdinalsProvider } from './mocks/mockOrdinalsProvider';
import { createMockSelector } from './mocks/mockSelector';

// Initialize ECC library for bitcoinjs-lib
// This is required for all P2TR operations and some other crypto operations
bitcoin.initEccLib(ecc);

// Global fetch mock
vi.mock('node:fetch', () => ({
  default: mockFetch(),
}));

globalThis.fetch = vi.fn().mockImplementation(mockFetch());

// Mock network-related providers
vi.mock('../src/providers/network-provider', () => ({
  createNetworkProvider: () => createMockNetworkProvider(),
  createMultiNetworkProvider: () => createMockNetworkProvider(),
}));

import {
  createMockHiroOrdinalsDetector,
  createMockOrdServerDetector,
} from './mocks/mockOrdinalsDetector';
import process from 'node:process';

// Mock Ordinals providers
vi.mock('../src/detectors/ord-server-detector', () => ({
  OrdServerDetector: class {
    constructor() {
      return createMockOrdServerDetector();
    }
  },
}));

vi.mock('../src/detectors/hiro-ordinals-detector', () => ({
  HiroOrdinalsDetector: class {
    constructor() {
      return createMockHiroOrdinalsDetector();
    }
  },
}));

vi.mock('../src/providers/ordinals-detector', () => ({
  createOrdinalsMultiProviderDetector: () => createMockOrdServerDetector(),
  createOrdinalProvider: () => createMockHiroOrdinalsDetector(),
}));

// Mock UTXO Selector
vi.mock('../src/selectors/utxo-selector', () => ({
  createSelector: () => createMockSelector(),
  createSelectionStrategy: () => createMockSelector(),
}));

// Mock ElectrumX Providers
vi.mock('../src/providers/electrumx-provider', () => ({
  ElectrumXProvider: vi.fn().mockImplementation(() => ({
    getUTXOs: vi.fn().mockResolvedValue([]),
    getBalance: vi.fn().mockResolvedValue({ confirmed: 150000, unconfirmed: 0 }),
    getTransaction: vi.fn().mockResolvedValue({
      txid: 'mock_txid',
      confirmations: 1,
      fee: 330,
    }),
    broadcastTransaction: vi.fn().mockResolvedValue('mock_txid'),
    testConnection: vi.fn().mockResolvedValue({ success: true, latency: 10 }),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getBlockHeight: vi.fn().mockResolvedValue(800000),
    getFeeRate: vi.fn().mockResolvedValue(15),
    estimateFee: vi.fn().mockResolvedValue(15),
  })),
  createElectrumXProvider: () => ({
    getUTXOs: vi.fn().mockResolvedValue([]),
    getBalance: vi.fn().mockResolvedValue({ confirmed: 150000, unconfirmed: 0 }),
    getTransaction: vi.fn().mockResolvedValue({
      txid: 'mock_txid',
      confirmations: 1,
      fee: 330,
    }),
    broadcastTransaction: vi.fn().mockResolvedValue('mock_txid'),
    testConnection: vi.fn().mockResolvedValue({ success: true, latency: 10 }),
  }),
  createElectrumXFeeProvider: () => ({
    getFeeRates: vi.fn().mockResolvedValue({
      low: 5,
      medium: 15,
      high: 30,
      urgent: 50,
    }),
    fetchFeeRates: vi.fn().mockResolvedValue({
      lowFee: 5,
      mediumFee: 15,
      highFee: 30,
      urgentFee: 50,
    }),
    estimateTransactionFee: vi.fn().mockResolvedValue({
      estimatedFee: 330,
      feeRate: 15,
      confidence: 0.85,
    }),
  }),
}));

// Configure default environment for network tests
process.env.NETWORK_TYPE = 'testnet';
process.env.ELECTRUM_SERVERS = JSON.stringify([
  'electrum1.testnet.example.com:50001',
  'electrum2.testnet.example.com:50001',
]);

// Global environment configuration for mocks
process.env.USE_MOCK_PROVIDERS = 'true';

// Export for tests that might need direct access
export {
  bitcoin,
  createMockNetworkProvider,
  createMockOrdinalsProvider,
  createMockSelector,
  ecc,
  mockFetch,
};
