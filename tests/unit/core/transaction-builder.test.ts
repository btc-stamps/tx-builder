import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import { TransactionBuilder } from '../../../src/core/transaction-builder.ts';
import type {
  BuildOptions,
  SignOptions,
  TransactionBuilderConfig,
  TransactionInput,
  TransactionOutput,
} from '../../../src/interfaces/transaction.interface.ts';
import type { UTXO } from '../../../src/interfaces/provider.interface.ts';
import { UTXOFixtureProvider } from '../../fixtures/utxo-fixture-provider.ts';

describe('TransactionBuilder', () => {
  let builder: TransactionBuilder;
  let testUTXOs: UTXO[];

  const defaultConfig: TransactionBuilderConfig = {
    network: bitcoin.networks.testnet,
    dustThreshold: 546,
    defaultFeeRate: 15,
    defaultRbf: true,
  };

  beforeEach(() => {
    builder = new TransactionBuilder(defaultConfig);
    testUTXOs = UTXOFixtureProvider.getDiverseSet().utxos;
  });

  describe('Constructor', () => {
    it('should create with default config values', () => {
      const config: TransactionBuilderConfig = {
        network: bitcoin.networks.bitcoin,
      };
      const newBuilder = new TransactionBuilder(config);
      expect(newBuilder).toBeDefined();
    });

    it('should create with custom config values', () => {
      const config: TransactionBuilderConfig = {
        network: bitcoin.networks.testnet,
        dustThreshold: 1000,
        defaultFeeRate: 20,
        defaultRbf: false,
      };
      const newBuilder = new TransactionBuilder(config);
      expect(newBuilder).toBeDefined();
    });
  });

  describe('Basic Transaction Building', () => {
    it('should create a basic PSBT with one output', async () => {
      const outputs: TransactionOutput[] = [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          value: 10000,
        },
      ];

      const options: BuildOptions = {
        outputs,
        network: bitcoin.networks.testnet,
      };

      const psbt = await builder.create(options);
      expect(psbt).toBeDefined();
      expect(psbt.outputCount).toBe(1);
    });

    it('should create PSBT with multiple outputs', async () => {
      const outputs: TransactionOutput[] = [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          value: 10000,
        },
        {
          address: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
          value: 5000,
        },
      ];

      const options: BuildOptions = {
        outputs,
        network: bitcoin.networks.testnet,
      };

      const psbt = await builder.create(options);
      expect(psbt).toBeDefined();
      expect(psbt.outputCount).toBe(2);
    });

    it('should create PSBT with script output', async () => {
      const outputs: TransactionOutput[] = [
        {
          script: Buffer.from('6a0568656c6c6f', 'hex'), // OP_RETURN "hello"
          value: 0,
        },
      ];

      const options: BuildOptions = {
        outputs,
        network: bitcoin.networks.testnet,
      };

      const psbt = await builder.create(options);
      expect(psbt).toBeDefined();
      expect(psbt.outputCount).toBe(1);
    });
  });

  describe('PSBT Creation and Configuration', () => {
    it('should set version when specified', async () => {
      const outputs: TransactionOutput[] = [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          value: 10000,
        },
      ];

      const options: BuildOptions = {
        outputs,
        version: 2,
        network: bitcoin.networks.testnet,
      };

      const psbt = await builder.create(options);
      expect(psbt.version).toBe(2);
    });

    it('should set locktime when specified', async () => {
      const outputs: TransactionOutput[] = [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          value: 10000,
        },
      ];

      const options: BuildOptions = {
        outputs,
        locktime: 500000,
        network: bitcoin.networks.testnet,
      };

      const psbt = await builder.create(options);
      expect(psbt.locktime).toBe(500000);
    });
  });

  describe('Input/Output Validation', () => {
    it('should throw error for empty outputs', async () => {
      const options: BuildOptions = {
        outputs: [],
        network: bitcoin.networks.testnet,
      };

      await expect(builder.create(options)).rejects.toThrow(
        'Transaction must have at least one output',
      );
    });

    it('should throw error for missing outputs', async () => {
      const options: BuildOptions = {
        outputs: undefined as any,
        network: bitcoin.networks.testnet,
      };

      await expect(builder.create(options)).rejects.toThrow(
        'Transaction must have at least one output',
      );
    });

    it('should throw error for output without address or script', async () => {
      const outputs: TransactionOutput[] = [
        {
          value: 10000,
        } as any,
      ];

      const options: BuildOptions = {
        outputs,
        network: bitcoin.networks.testnet,
      };

      await expect(builder.create(options)).rejects.toThrow(
        'Output must have either address or script',
      );
    });

    it('should throw error for negative output value', async () => {
      const outputs: TransactionOutput[] = [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          value: -1000,
        },
      ];

      const options: BuildOptions = {
        outputs,
        network: bitcoin.networks.testnet,
      };

      await expect(builder.create(options)).rejects.toThrow(
        'Output value must be a non-negative number',
      );
    });

    it('should throw error for non-numeric output value', async () => {
      const outputs: TransactionOutput[] = [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          value: 'invalid' as any,
        },
      ];

      const options: BuildOptions = {
        outputs,
        network: bitcoin.networks.testnet,
      };

      await expect(builder.create(options)).rejects.toThrow(
        'Output value must be a non-negative number',
      );
    });
  });

  describe('Fee Calculation', () => {
    it('should calculate fee correctly', () => {
      const size = 250; // bytes
      const feeRate = 15; // sat/vB
      const expectedFee = Math.ceil(size * feeRate);

      const calculatedFee = builder.calculateFee(size, feeRate);
      expect(calculatedFee).toBe(expectedFee);
    });

    it('should estimate size correctly', () => {
      const inputCount = 1;
      const outputCount = 2;
      const hasWitness = true;

      const size = builder.estimateSize(inputCount, outputCount, hasWitness);
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });

    it('should estimate size for legacy inputs', () => {
      const inputCount = 1;
      const outputCount = 2;
      const hasWitness = false;

      const size = builder.estimateSize(inputCount, outputCount, hasWitness);
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });
  });

  describe('RBF (Replace-By-Fee) Support', () => {
    it('should enable RBF by default', async () => {
      const inputs: TransactionInput[] = [
        {
          utxo: testUTXOs[0],
          witnessUtxo: {
            script: Buffer.from(testUTXOs[0].scriptPubKey, 'hex'),
            value: testUTXOs[0].value,
          },
        },
      ];

      const outputs: TransactionOutput[] = [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          value: 10000,
        },
      ];

      const options: BuildOptions = {
        inputs,
        outputs,
        network: bitcoin.networks.testnet,
      };

      const psbt = await builder.create(options);
      expect(psbt).toBeDefined();
      // RBF sequence should be 0xfffffffd
      expect(psbt.txInputs[0].sequence).toBe(0xfffffffd);
    });

    it('should respect custom sequence for RBF', async () => {
      const customSequence = 0xfffffffe;
      const inputs: TransactionInput[] = [
        {
          utxo: testUTXOs[0],
          sequence: customSequence,
          witnessUtxo: {
            script: Buffer.from(testUTXOs[0].scriptPubKey, 'hex'),
            value: testUTXOs[0].value,
          },
        },
      ];

      const outputs: TransactionOutput[] = [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          value: 10000,
        },
      ];

      const options: BuildOptions = {
        inputs,
        outputs,
        network: bitcoin.networks.testnet,
      };

      const psbt = await builder.create(options);
      expect(psbt.txInputs[0].sequence).toBe(customSequence);
    });
  });

  describe('Multi-signature Support', () => {
    it('should handle multiple key pairs for signing', async () => {
      // Create a mock PSBT for testing
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });

      // Mock key pairs
      const keyPair1 = {
        publicKey: Buffer.alloc(33, 1),
        sign: vi.fn().mockReturnValue(Buffer.alloc(64)),
      } as any;

      const keyPair2 = {
        publicKey: Buffer.alloc(33, 2),
        sign: vi.fn().mockReturnValue(Buffer.alloc(64)),
      } as any;

      // Mock psbt methods
      psbt.signInput = vi.fn();
      Object.defineProperty(psbt, 'inputCount', { value: 1, writable: false });

      const signOptions: SignOptions = {
        keyPairs: [keyPair1, keyPair2],
      };

      await builder.sign(psbt, signOptions);

      // Should attempt to sign with both key pairs
      expect(psbt.signInput).toHaveBeenCalled();
    });

    it('should handle single key pair signing', async () => {
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });

      const keyPair = {
        publicKey: Buffer.alloc(33, 1),
        sign: vi.fn().mockReturnValue(Buffer.alloc(64)),
      } as any;

      psbt.signAllInputs = vi.fn();

      const signOptions: SignOptions = {
        keyPair,
        signAll: true,
      };

      await builder.sign(psbt, signOptions);

      expect(psbt.signAllInputs).toHaveBeenCalledWith(keyPair);
    });

    it('should handle sighash type in signing', async () => {
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });

      const keyPair = {
        publicKey: Buffer.alloc(33, 1),
        sign: vi.fn().mockReturnValue(Buffer.alloc(64)),
      } as any;

      psbt.signAllInputs = vi.fn();

      const signOptions: SignOptions = {
        keyPair,
        signAll: true,
        sighashType: bitcoin.Transaction.SIGHASH_SINGLE,
      };

      await builder.sign(psbt, signOptions);

      expect(psbt.signAllInputs).toHaveBeenCalledWith(
        keyPair,
        [bitcoin.Transaction.SIGHASH_SINGLE],
      );
    });
  });

  describe('buildFromUTXOs', () => {
    it('should build transaction from UTXOs with sufficient funds', () => {
      const utxos = testUTXOs.slice(0, 2); // Use first 2 UTXOs
      const outputs: TransactionOutput[] = [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          value: 10000,
        },
      ];
      const changeAddress = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

      const psbt = builder.buildFromUTXOs(utxos, outputs, changeAddress);

      expect(psbt).toBeDefined();
      expect(psbt.outputCount).toBeGreaterThan(0);
      expect(psbt.txInputs.length).toBe(utxos.length);
    });

    it('should throw error for insufficient funds', () => {
      const utxos = testUTXOs.slice(0, 1); // Use only first UTXO
      const outputs: TransactionOutput[] = [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          value: 999999999, // Extremely high value
        },
      ];
      const changeAddress = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

      expect(() => {
        builder.buildFromUTXOs(utxos, outputs, changeAddress);
      }).toThrow('Insufficient funds');
    });

    it('should add change output when change amount exceeds dust threshold', () => {
      const utxos = testUTXOs.slice(0, 2); // Use first 2 UTXOs with higher values
      const outputs: TransactionOutput[] = [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          value: 1000, // Small value to ensure large change
        },
      ];
      const changeAddress = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

      const psbt = builder.buildFromUTXOs(utxos, outputs, changeAddress);

      // Should have original output + change output
      expect(psbt.outputCount).toBeGreaterThan(1);
    });

    it('should not add change output when change amount is below dust threshold', () => {
      // This test would need specific UTXOs that result in small change
      const utxos = [
        {
          txid: '1'.repeat(64),
          vout: 0,
          value: 1002000, // Large UTXO to cover fee and change
          scriptPubKey: '76a914' + '0'.repeat(40) + '88ac',
          confirmations: 6,
        },
      ];

      const outputs: TransactionOutput[] = [
        {
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          value: 1000400, // Value that results in small change after fee (under dust threshold)
        },
      ];
      const changeAddress = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

      const psbt = builder.buildFromUTXOs(utxos, outputs, changeAddress);

      // Should only have the original output (no change)
      expect(psbt.outputCount).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid address in outputs', async () => {
      const outputs: TransactionOutput[] = [
        {
          address: 'invalid-address',
          value: 10000,
        },
      ];

      const options: BuildOptions = {
        outputs,
        network: bitcoin.networks.testnet,
      };

      await expect(builder.create(options)).rejects.toThrow(
        'Invalid address for network',
      );
    });

    it('should handle signing errors gracefully', async () => {
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });

      // Mock a key pair that throws during signing
      const keyPair = {
        publicKey: Buffer.alloc(33, 1),
        sign: vi.fn().mockImplementation(() => {
          throw new Error('Signing failed');
        }),
      } as any;

      psbt.signInput = vi.fn().mockImplementation(() => {
        throw new Error('Cannot sign input');
      });
      Object.defineProperty(psbt, 'inputCount', { value: 1, writable: false });

      const signOptions: SignOptions = {
        keyPair,
      };

      // Should not throw, should silently skip failed inputs
      await expect(builder.sign(psbt, signOptions)).resolves.not.toThrow();
    });
  });

  describe('Network Type Detection', () => {
    it('should detect mainnet correctly', () => {
      const networkType = builder.getNetworkType(bitcoin.networks.bitcoin);
      expect(networkType).toBe('mainnet');
    });

    it('should detect testnet correctly', () => {
      const networkType = builder.getNetworkType(bitcoin.networks.testnet);
      expect(networkType).toBe('testnet');
    });

    it('should detect regtest correctly', () => {
      const networkType = builder.getNetworkType(bitcoin.networks.regtest);
      expect(networkType).toBe('regtest');
    });

    it('should default to mainnet for undefined network', () => {
      const networkType = builder.getNetworkType();
      expect(networkType).toBe('mainnet');
    });
  });

  describe('SRC-20 Specific Features', () => {
    it('should get SRC-20 minimum value', () => {
      const minValue = builder.getSrc20MinValue();
      expect(minValue).toBe(500000);
    });

    it('should check if change amount is above dust threshold for P2WPKH', () => {
      const amount = 1000;
      const isAboveDust = builder.isChangeAboveDust(amount, 'P2WPKH');
      expect(typeof isAboveDust).toBe('boolean');
    });

    it('should handle OP_RETURN outputs for dust calculation', () => {
      const amount = 0;
      const isAboveDust = builder.isChangeAboveDust(amount, 'OP_RETURN');
      expect(isAboveDust).toBe(true); // OP_RETURN can be 0 value
    });

    it('should calculate stamp optimal change', () => {
      const inputValue = 600000;
      const outputValue = 500000;
      const estimatedFee = 5000;

      const result = builder.calculateStampOptimalChange(
        inputValue,
        outputValue,
        estimatedFee,
      );

      expect(result).toHaveProperty('changeValue');
      expect(result).toHaveProperty('shouldCreateChange');
      expect(typeof result.changeValue).toBe('number');
      expect(typeof result.shouldCreateChange).toBe('boolean');
    });

    it('should identify stamp transactions correctly', () => {
      const stampParams = {
        stampValue: 500000,
        dataOutputCount: 5,
        isStampCreation: true,
      };

      const isStamp = builder.isStampTransaction(stampParams);
      expect(isStamp).toBe(true);
    });

    it('should reject non-stamp transactions', () => {
      const nonStampParams = {
        stampValue: 1000, // Below minimum
        dataOutputCount: 5,
        isStampCreation: true,
      };

      const isStamp = builder.isStampTransaction(nonStampParams);
      expect(isStamp).toBe(false);
    });
  });

  describe('Advanced Fee Estimation', () => {
    it.skip('should estimate optimal fee for different input/output combinations', async () => {
      // Skipped: requires network access for fee estimation
      const inputs = [{ type: 'P2WPKH' as const }];
      const outputs = [{ type: 'P2WPKH' as const }, { type: 'OP_RETURN' as const }];

      const result = await builder.estimateOptimalFee(inputs, outputs, 'medium');

      expect(result).toHaveProperty('totalFee');
      expect(result).toHaveProperty('feeRate');
      expect(result).toHaveProperty('virtualSize');
      expect(typeof result.totalFee).toBe('number');
      expect(typeof result.feeRate).toBe('number');
      expect(typeof result.virtualSize).toBe('number');
    });

    it('should get dynamic dust thresholds', () => {
      const dustThresholds = builder.getDustThresholds(15);

      expect(dustThresholds).toHaveProperty('P2WPKH');
      expect(dustThresholds).toHaveProperty('P2SH');
      expect(dustThresholds).toHaveProperty('P2PKH');
      expect(typeof dustThresholds.P2WPKH).toBe('number');
    });

    it('should estimate size with different input/output types', () => {
      const inputs = [{ type: 'P2WPKH' as const }, { type: 'P2SH' as const }];
      const outputs = [{ type: 'P2WPKH' as const }, { type: 'OP_RETURN' as const }];

      const size = builder.estimateSizeWithTypes(inputs, outputs);

      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('Transaction Finalization', () => {
    it('should finalize PSBT and extract transaction', async () => {
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });

      // Mock the finalization methods
      psbt.finalizeAllInputs = vi.fn();
      psbt.extractTransaction = vi.fn().mockReturnValue(
        new bitcoin.Transaction(),
      );

      const transaction = await builder.finalize(psbt);

      expect(psbt.finalizeAllInputs).toHaveBeenCalled();
      expect(psbt.extractTransaction).toHaveBeenCalled();
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
    });
  });

  describe('Stamp Fee Calculation', () => {
    it.skip('should calculate stamp transaction fee', async () => {
      // Skipped: requires network access for fee estimation
      const params = {
        isStampCreation: true,
        stampValue: 500000,
        dataOutputCount: 3,
        inputCount: 1,
        changeOutputCount: 1,
      };

      const inputs = [{ type: 'P2WPKH' as const }];
      const outputs = [
        { type: 'P2WPKH' as const },
        { type: 'P2WSH' as const },
        { type: 'OP_RETURN' as const },
      ];

      const result = await builder.calculateStampTransactionFee(
        params,
        inputs,
        outputs,
        'medium',
      );

      expect(result).toHaveProperty('totalFee');
      expect(result).toHaveProperty('feeRate');
      expect(typeof result.totalFee).toBe('number');
    });

    it.skip('should estimate stamp transaction cost', async () => {
      // Skipped: requires network access for fee estimation
      const params = {
        isStampCreation: true,
        stampValue: 500000,
        dataOutputCount: 3,
        inputCount: 1,
        changeOutputCount: 1,
      };

      const inputs = [{ type: 'P2WPKH' as const }];
      const outputs = [
        { type: 'P2WPKH' as const },
        { type: 'P2WSH' as const },
        { type: 'OP_RETURN' as const },
      ];

      const result = await builder.estimateStampTransactionCost(
        params,
        inputs,
        outputs,
        'medium',
      );

      expect(result).toHaveProperty('totalCost');
      expect(result).toHaveProperty('breakdown');
      expect(typeof result.totalCost).toBe('number');
    });

    it('should get stamp fee rates', () => {
      const feeRates = builder.getStampFeeRates();

      expect(feeRates).toHaveProperty('stampCreation');
      expect(feeRates).toHaveProperty('stampTransfer');
      expect(feeRates).toHaveProperty('regularWithStamp');
      expect(feeRates.stampCreation).toHaveProperty('low');
      expect(feeRates.stampCreation).toHaveProperty('medium');
      expect(feeRates.stampCreation).toHaveProperty('high');
      expect(feeRates.stampCreation).toHaveProperty('urgent');
    });
  });
});
