/**
 * Environment Validator Tests
 *
 * Tests for the ElectrumX environment variable validation utility that handles
 * comprehensive validation and configuration loading with clear error messages.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import process from 'node:process';

import {
  ELECTRUMX_ENV_VARS,
  type ElectrumXEnvConfig,
  getEnvironmentConfigDocumentation,
  loadElectrumXEnvironmentConfig,
  validateElectrumXConfiguration,
  type ValidationResult,
} from '../../../src/config/env-validator';

describe('Environment Variable Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };

    // Clear all ElectrumX-related environment variables for clean test slate
    Object.keys(ELECTRUMX_ENV_VARS).forEach((varName) => {
      delete process.env[varName];
    });

    // Mock console methods to avoid test output pollution
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Server String Validation', () => {
    describe('Valid Server Formats', () => {
      it('should validate single server with host:port format', () => {
        process.env.ELECTRUMX_MAINNET_SERVERS = 'electrum.example.com:50002';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.config.mainnetServers).toBe('electrum.example.com:50002');
      });

      it('should validate single server with host:port:protocol format', () => {
        process.env.ELECTRUMX_MAINNET_SERVERS = 'electrum.example.com:50002:ssl';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.config.mainnetServers).toBe('electrum.example.com:50002:ssl');
      });

      it('should validate multiple servers', () => {
        process.env.ELECTRUMX_MAINNET_SERVERS = 'server1.com:50002:ssl,server2.com:50001:tcp';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.config.mainnetServers).toBe('server1.com:50002:ssl,server2.com:50001:tcp');
      });

      it('should validate servers with numeric hostnames', () => {
        process.env.ELECTRUMX_MAINNET_SERVERS = '192.168.1.100:50002:ssl,10.0.0.1:50001:tcp';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate localhost variants', () => {
        process.env.ELECTRUMX_REGTEST_SERVERS = 'localhost:50001:tcp,127.0.0.1:50002:ssl';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.config.regtestServers).toBe('localhost:50001:tcp,127.0.0.1:50002:ssl');
      });
    });

    describe('Invalid Server Formats', () => {
      it('should ignore empty server string', () => {
        process.env.ELECTRUMX_MAINNET_SERVERS = '';

        const result = loadElectrumXEnvironmentConfig();

        // Empty string is falsy, so it's ignored entirely
        expect(result.valid).toBe(true);
        expect(result.config.mainnetServers).toBeUndefined();
      });

      it('should reject servers with missing port', () => {
        process.env.ELECTRUMX_MAINNET_SERVERS = 'electrum.example.com';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(false);
        expect(result.errors.some((err) => err.includes('Invalid format'))).toBe(true);
      });

      it('should reject servers with invalid port numbers', () => {
        process.env.ELECTRUMX_MAINNET_SERVERS = 'electrum.example.com:abc';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(false);
        expect(result.errors.some((err) => err.includes('Invalid port'))).toBe(true);
      });

      it('should reject servers with out-of-range port numbers', () => {
        process.env.ELECTRUMX_MAINNET_SERVERS = 'electrum.example.com:70000';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(false);
        expect(result.errors.some((err) => err.includes('Invalid port'))).toBe(true);
      });

      it('should reject servers with invalid protocol', () => {
        process.env.ELECTRUMX_MAINNET_SERVERS = 'electrum.example.com:50002:invalid';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(false);
        expect(result.errors.some((err) => err.includes('Invalid protocol'))).toBe(true);
      });

      it('should reject servers with empty host', () => {
        process.env.ELECTRUMX_MAINNET_SERVERS = ':50002:ssl';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(false);
        expect(result.errors.some((err) => err.includes('Host cannot be empty'))).toBe(true);
      });

      it('should reject servers with invalid host characters', () => {
        process.env.ELECTRUMX_MAINNET_SERVERS = 'invalid@host:50002:ssl';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(false);
        expect(result.errors.some((err) => err.includes('Invalid host format'))).toBe(true);
      });
    });
  });

  describe('Boolean Validation', () => {
    it('should accept true values', () => {
      const trueValues = ['true', '1', 'yes', 'on', 'TRUE', 'YES', 'ON'];

      trueValues.forEach((value) => {
        process.env.ELECTRUMX_FALLBACK_TO_PUBLIC = value;

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(true);
        expect(result.config.fallbackToPublic).toBe(true);
      });
    });

    it('should accept false values', () => {
      const falseValues = ['false', '0', 'no', 'off', 'FALSE', 'NO', 'OFF'];

      falseValues.forEach((value) => {
        process.env.ELECTRUMX_FALLBACK_TO_PUBLIC = value;

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(true);
        expect(result.config.fallbackToPublic).toBe(false);
      });
    });

    it('should reject invalid boolean values', () => {
      process.env.ELECTRUMX_FALLBACK_TO_PUBLIC = 'maybe';

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.some((err) => err.includes('Invalid boolean value'))).toBe(true);
    });
  });

  describe('Number Validation', () => {
    describe('Valid Numbers', () => {
      it('should accept valid timeout values', () => {
        process.env.ELECTRUMX_TIMEOUT = '10000';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(true);
        expect(result.config.timeout).toBe(10000);
      });

      it('should accept minimum and maximum values', () => {
        process.env.ELECTRUMX_TIMEOUT = '1000'; // minimum

        let result = loadElectrumXEnvironmentConfig();
        expect(result.valid).toBe(true);

        process.env.ELECTRUMX_TIMEOUT = '300000'; // maximum

        result = loadElectrumXEnvironmentConfig();
        expect(result.valid).toBe(true);
      });

      it('should accept zero for max retries', () => {
        process.env.ELECTRUMX_MAX_RETRIES = '0';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(true);
        expect(result.config.maxRetries).toBe(0);
      });
    });

    describe('Invalid Numbers', () => {
      it('should reject non-numeric values', () => {
        process.env.ELECTRUMX_TIMEOUT = 'not-a-number';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(false);
        expect(result.errors.some((err) => err.includes('Invalid number'))).toBe(true);
      });

      it('should reject values below minimum', () => {
        process.env.ELECTRUMX_TIMEOUT = '500'; // below minimum of 1000

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(false);
        expect(result.errors.some((err) => err.includes('below minimum'))).toBe(true);
      });

      it('should reject values above maximum', () => {
        process.env.ELECTRUMX_TIMEOUT = '400000'; // above maximum of 300000

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(false);
        expect(result.errors.some((err) => err.includes('above maximum'))).toBe(true);
      });

      it('should reject negative values for retries', () => {
        process.env.ELECTRUMX_MAX_RETRIES = '-1';

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(false);
        expect(result.errors.some((err) => err.includes('below minimum'))).toBe(true);
      });
    });
  });

  describe('Enum Validation', () => {
    it('should accept valid network values', () => {
      const validNetworks = ['mainnet', 'testnet', 'regtest', 'bitcoin', 'testnet3', 'regtest1'];

      validNetworks.forEach((network) => {
        process.env.TX_BUILDER_NETWORK = network;

        const result = loadElectrumXEnvironmentConfig();

        expect(result.valid).toBe(true);
        expect(result.config.network).toBe(network);
      });
    });

    it('should accept case-insensitive network values', () => {
      process.env.TX_BUILDER_NETWORK = 'MAINNET';

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(true);
      expect(result.config.network).toBe('mainnet');
    });

    it('should reject invalid network values', () => {
      process.env.TX_BUILDER_NETWORK = 'invalid-network';

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.some((err) => err.includes('Invalid value'))).toBe(true);
    });

    it('should accept valid protocol values for legacy settings', () => {
      const validProtocols = ['tcp', 'ssl', 'ws', 'wss'];

      validProtocols.forEach((protocol) => {
        // Clear previous env vars
        Object.keys(process.env).forEach((key) => {
          if (key.startsWith('ELECTRUMX_')) delete process.env[key];
        });

        process.env.ELECTRUMX_PROTOCOL = protocol;

        const result = loadElectrumXEnvironmentConfig();

        expect(result.config.legacyProtocol).toBe(protocol);
      });
    });
  });

  describe('Configuration Loading', () => {
    it('should load configuration with no environment variables', () => {
      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config).toEqual({});
    });

    it('should load all types of configuration variables', () => {
      process.env.ELECTRUMX_MAINNET_SERVERS = 'server1.com:50002:ssl';
      process.env.ELECTRUMX_TESTNET_SERVERS = 'testnet.com:50002:ssl';
      process.env.ELECTRUMX_TIMEOUT = '15000';
      process.env.ELECTRUMX_MAX_RETRIES = '5';
      process.env.ELECTRUMX_FALLBACK_TO_PUBLIC = 'true';
      process.env.TX_BUILDER_NETWORK = 'mainnet';

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(true);
      expect(result.config).toEqual({
        mainnetServers: 'server1.com:50002:ssl',
        testnetServers: 'testnet.com:50002:ssl',
        timeout: 15000,
        maxRetries: 5,
        fallbackToPublic: true,
        network: 'mainnet',
      });
    });

    it('should load legacy environment variables', () => {
      process.env.ELECTRUMX_HOST = 'legacy.server.com';
      process.env.ELECTRUMX_PORT = '50003';
      process.env.ELECTRUMX_PROTOCOL = 'ssl';
      process.env.ELECTRUMX_ENDPOINTS = 'endpoint1.com:50002:ssl,endpoint2.com:50001:tcp';

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(true);
      expect(result.config.legacyHost).toBe('legacy.server.com');
      expect(result.config.legacyPort).toBe(50003);
      expect(result.config.legacyProtocol).toBe('ssl');
      expect(result.config.legacyEndpoints).toBe('endpoint1.com:50002:ssl,endpoint2.com:50001:tcp');
    });

    it('should collect multiple validation errors', () => {
      process.env.ELECTRUMX_MAINNET_SERVERS = 'invalid-server'; // Missing port
      process.env.ELECTRUMX_TIMEOUT = 'not-a-number'; // Invalid number
      process.env.ELECTRUMX_FALLBACK_TO_PUBLIC = 'maybe'; // Invalid boolean
      process.env.TX_BUILDER_NETWORK = 'invalid-network'; // Invalid enum

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors.some((err) => err.includes('Invalid format'))).toBe(true);
      expect(result.errors.some((err) => err.includes('Invalid number'))).toBe(true);
      expect(result.errors.some((err) => err.includes('Invalid boolean'))).toBe(true);
      expect(result.errors.some((err) => err.includes('Invalid value'))).toBe(true);
    });
  });

  describe('Deprecated Variable Warnings', () => {
    it('should warn about deprecated ELECTRUMX_HOST', () => {
      process.env.ELECTRUMX_HOST = 'deprecated.server.com';

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(true);
      expect(result.warnings.some((warn) => warn.includes('ELECTRUMX_HOST is deprecated'))).toBe(
        true,
      );
    });

    it('should warn about deprecated ELECTRUMX_ENDPOINTS', () => {
      process.env.ELECTRUMX_ENDPOINTS = 'deprecated.server.com:50002:ssl';

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(true);
      expect(result.warnings.some((warn) => warn.includes('ELECTRUMX_ENDPOINTS is deprecated')))
        .toBe(true);
    });

    it('should provide replacement suggestions for deprecated variables', () => {
      process.env.ELECTRUMX_HOST = 'deprecated.server.com';

      const result = loadElectrumXEnvironmentConfig();

      expect(result.warnings.some((warn) => warn.includes('ELECTRUMX_MAINNET_SERVERS'))).toBe(true);
    });

    it('should not warn about non-deprecated variables', () => {
      process.env.ELECTRUMX_MAINNET_SERVERS = 'server.com:50002:ssl';

      const result = loadElectrumXEnvironmentConfig();

      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('Complex Validation Scenarios', () => {
    it('should handle mixed valid and invalid configurations', () => {
      process.env.ELECTRUMX_MAINNET_SERVERS = 'valid.server.com:50002:ssl'; // Valid
      process.env.ELECTRUMX_TIMEOUT = 'invalid-timeout'; // Invalid
      process.env.ELECTRUMX_MAX_RETRIES = '3'; // Valid
      process.env.ELECTRUMX_FALLBACK_TO_PUBLIC = 'invalid-bool'; // Invalid

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(false);
      expect(result.config.mainnetServers).toBe('valid.server.com:50002:ssl');
      expect(result.config.maxRetries).toBe(3);
      expect(result.config.timeout).toBeUndefined();
      expect(result.config.fallbackToPublic).toBeUndefined();
      expect(result.errors).toHaveLength(2);
    });

    it('should handle whitespace in server strings', () => {
      process.env.ELECTRUMX_MAINNET_SERVERS = ' server1.com:50002:ssl , server2.com:50001:tcp ';

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(true);
      expect(result.config.mainnetServers).toBe(' server1.com:50002:ssl , server2.com:50001:tcp ');
    });

    it('should handle edge case port numbers', () => {
      process.env.ELECTRUMX_MAINNET_SERVERS = 'server.com:1,server2.com:65535'; // Min and max ports

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(true);
    });
  });
});

describe('Utility Functions', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('getEnvironmentConfigDocumentation', () => {
    it('should return comprehensive documentation string', () => {
      const docs = getEnvironmentConfigDocumentation();

      expect(docs).toContain('ElectrumX Environment Variable Configuration Guide');
      expect(docs).toContain('ELECTRUMX_MAINNET_SERVERS');
      expect(docs).toContain('ELECTRUMX_TIMEOUT');
      expect(docs).toContain('TX_BUILDER_NETWORK');
      expect(docs).toContain('Configuration Validation');
      expect(docs).toContain('Migration Guide');
      expect(docs).toContain('Best Practices');
    });

    it('should include examples for all environment variables', () => {
      const docs = getEnvironmentConfigDocumentation();

      Object.keys(ELECTRUMX_ENV_VARS).forEach((varName) => {
        expect(docs).toContain(varName);
      });
    });

    it('should mark deprecated variables clearly', () => {
      const docs = getEnvironmentConfigDocumentation();

      expect(docs).toContain('[DEPRECATED]');
    });
  });

  describe('validateElectrumXConfiguration', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      Object.keys(ELECTRUMX_ENV_VARS).forEach((varName) => {
        delete process.env[varName];
      });
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return result without throwing when throwOnError is false', () => {
      process.env.ELECTRUMX_TIMEOUT = 'invalid';

      const result = validateElectrumXConfiguration(false);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should throw error when validation fails and throwOnError is true', () => {
      process.env.ELECTRUMX_TIMEOUT = 'invalid';

      expect(() => validateElectrumXConfiguration(true)).toThrow(
        'ElectrumX configuration validation failed',
      );
    });

    it('should return valid result for valid configuration', () => {
      process.env.ELECTRUMX_MAINNET_SERVERS = 'server.com:50002:ssl';

      const result = validateElectrumXConfiguration(false);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about deprecated variables when valid', () => {
      process.env.ELECTRUMX_HOST = 'deprecated.server.com';

      const result = validateElectrumXConfiguration(false);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(console.warn).toHaveBeenCalledWith('ElectrumX configuration warnings:');
    });

    it('should include documentation reference in error message', () => {
      process.env.ELECTRUMX_TIMEOUT = 'invalid';

      expect(() => validateElectrumXConfiguration(true)).toThrow(
        /getEnvironmentConfigDocumentation/,
      );
    });
  });
});

describe('Edge Cases and Error Handling', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    Object.keys(ELECTRUMX_ENV_VARS).forEach((varName) => {
      delete process.env[varName];
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Boundary Conditions', () => {
    it('should handle environment variables with only whitespace', () => {
      process.env.ELECTRUMX_MAINNET_SERVERS = '   ';

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.some((err) => err.includes('Server string cannot be empty'))).toBe(true);
    });

    it('should handle very long server strings', () => {
      const longServerString = Array(100).fill('server.com:50002:ssl').join(',');
      process.env.ELECTRUMX_MAINNET_SERVERS = longServerString;

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(true);
      expect(result.config.mainnetServers).toBe(longServerString);
    });

    it('should handle maximum allowed numeric values', () => {
      process.env.ELECTRUMX_TIMEOUT = '300000'; // Max timeout
      process.env.ELECTRUMX_MAX_RETRIES = '10'; // Max retries
      process.env.ELECTRUMX_POOL_SIZE = '20'; // Max pool size

      const result = loadElectrumXEnvironmentConfig();

      expect(result.valid).toBe(true);
      expect(result.config.timeout).toBe(300000);
      expect(result.config.maxRetries).toBe(10);
      expect(result.config.poolSize).toBe(20);
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety in configuration object', () => {
      process.env.ELECTRUMX_MAINNET_SERVERS = 'server.com:50002:ssl';
      process.env.ELECTRUMX_TIMEOUT = '10000';
      process.env.ELECTRUMX_FALLBACK_TO_PUBLIC = 'true';

      const result = loadElectrumXEnvironmentConfig();

      expect(typeof result.config.mainnetServers).toBe('string');
      expect(typeof result.config.timeout).toBe('number');
      expect(typeof result.config.fallbackToPublic).toBe('boolean');
    });

    it('should return ValidationResult with correct structure', () => {
      const result = loadElectrumXEnvironmentConfig();

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('config');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(typeof result.config).toBe('object');
    });
  });
});
