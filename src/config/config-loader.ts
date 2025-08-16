/**
 * Configuration Loader for tx-builder
 * Loads configuration with priority:
 * 1. Runtime options (passed to constructor)
 * 2. Environment variables
 * 3. Config file (.tx-builder.json or tx-builder.config.json)
 * 4. Default values
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import * as bitcoin from 'bitcoinjs-lib';
import type { Network } from 'bitcoinjs-lib';

import {
  createElectrumXConfig,
  ElectrumXConfig,
  ElectrumXEndpoint,
  getElectrumXConfigDocumentation,
  validateConfig,
} from './electrumx-config.ts';
import process from 'node:process';

export class ConfigLoader {
  private static instance: ConfigLoader;

  /**
   * Load configuration with priority:
   * 1. Runtime options (passed to constructor)
   * 2. Environment variables (NEW: Uses centralized config)
   * 3. Config file (.tx-builder.json or tx-builder.config.json)
   * 4. Fallback defaults
   */
  static loadConfig(options?: Partial<ElectrumXConfig>): ElectrumXConfig {
    const loader = ConfigLoader.instance || new ConfigLoader();
    return loader.load(options);
  }

  private load(options?: Partial<ElectrumXConfig>): ElectrumXConfig {
    // Start with centralized configuration based on network
    const network = options?.network || this.parseNetworkFromEnv() ||
      bitcoin.networks.bitcoin;

    // Use new centralized configuration system
    let config = createElectrumXConfig(network);

    // Layer 2: Config file overrides (if exists)
    const configFile = this.loadConfigFile();
    if (configFile) {
      config = { ...config, ...configFile };
      if (configFile.endpoints) {
        config.endpoints = [...configFile.endpoints];
      }
    }

    // Layer 3: Legacy environment variable support (backwards compatibility)
    const legacyEnvEndpoints = this.loadLegacyEnvironment();
    if (legacyEnvEndpoints.length > 0) {
      console.warn(
        'Using legacy ELECTRUMX_HOST/ELECTRUMX_ENDPOINTS. Consider migrating to new environment variables. See getElectrumXConfigDocumentation()',
      );
      config.endpoints = [...legacyEnvEndpoints, ...config.endpoints];
    }

    const envConfig = this.loadConfigFromEnvironment();
    if (envConfig) {
      config = { ...config, ...envConfig };
    }

    // Layer 4: Runtime options (highest priority)
    if (options) {
      config = { ...config, ...options };
      if (options.endpoints) {
        // Runtime endpoints replace all others
        config.endpoints = options.endpoints;
      }
    }

    // Sort endpoints by priority
    config.endpoints.sort((a, b) => (a.priority || 999) - (b.priority || 999));

    // Validate final configuration
    const validationErrors = validateConfig(config);
    if (validationErrors.length > 0) {
      throw new Error(
        `Configuration validation failed: ${validationErrors.join(', ')}`,
      );
    }

    return config;
  }

  private parseNetworkFromEnv(): Network | null {
    const envNetwork = process.env.TX_BUILDER_NETWORK;
    if (!envNetwork) return null;

    // Use actual Network objects from bitcoinjs-lib
    switch (envNetwork.toLowerCase()) {
      case 'testnet':
      case 'testnet3':
        return bitcoin.networks.testnet;
      case 'regtest':
      case 'regtest1':
        return bitcoin.networks.regtest;
      case 'mainnet':
      case 'bitcoin':
      default:
        return bitcoin.networks.bitcoin;
    }
  }

  private loadLegacyEnvironment(): ElectrumXEndpoint[] {
    const endpoints: ElectrumXEndpoint[] = [];

    // Support multiple formats for flexibility

    // Format 1: Single endpoint
    if (process.env.ELECTRUMX_HOST) {
      endpoints.push({
        host: process.env.ELECTRUMX_HOST,
        port: parseInt(process.env.ELECTRUMX_PORT || '50002'),
        protocol: (process.env.ELECTRUMX_PROTOCOL as any) || 'ssl',
        priority: 0,
      });
    }

    // Format 2: Multiple endpoints (comma-separated)
    if (process.env.ELECTRUMX_ENDPOINTS) {
      const endpointStrings = process.env.ELECTRUMX_ENDPOINTS.split(',');
      endpointStrings.forEach((endpoint, index) => {
        const [host, port, protocol] = endpoint.trim().split(':');
        if (host) {
          endpoints.push({
            host,
            port: parseInt(port || '50002'),
            protocol: (protocol as any) || 'ssl',
            priority: index,
          });
        }
      });
    }

    // Format 3: JSON configuration
    if (process.env.TX_BUILDER_ELECTRUMX_CONFIG) {
      try {
        const parsed = JSON.parse(process.env.TX_BUILDER_ELECTRUMX_CONFIG);
        if (Array.isArray(parsed)) {
          endpoints.push(...parsed);
        }
      } catch (e) {
        console.warn('Failed to parse TX_BUILDER_ELECTRUMX_CONFIG:', e);
      }
    }

    return endpoints;
  }

  private loadConfigFromEnvironment(): Partial<ElectrumXConfig> | null {
    const config: Partial<ElectrumXConfig> = {};

    if (process.env.TX_BUILDER_CONNECTION_TIMEOUT) {
      const timeout = parseInt(process.env.TX_BUILDER_CONNECTION_TIMEOUT);
      if (!isNaN(timeout)) {
        config.connectionTimeout = timeout;
      }
    }

    if (process.env.TX_BUILDER_REQUEST_TIMEOUT) {
      const timeout = parseInt(process.env.TX_BUILDER_REQUEST_TIMEOUT);
      if (!isNaN(timeout)) {
        config.requestTimeout = timeout;
      }
    }

    if (process.env.TX_BUILDER_FALLBACK_TO_PUBLIC) {
      config.fallbackToPublic = process.env.TX_BUILDER_FALLBACK_TO_PUBLIC.toLowerCase() === 'true';
    }

    return Object.keys(config).length > 0 ? config : null;
  }

  private loadConfigFile(): Partial<ElectrumXConfig> | null {
    // Look for config files in order of preference
    const configPaths = [
      path.join(process.cwd(), '.tx-builder.json'),
      path.join(process.cwd(), 'tx-builder.config.json'),
      path.join(process.cwd(), 'config', 'tx-builder.json'),
    ];

    for (const configPath of configPaths) {
      if (this.fileExists(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf-8');
          const parsed = JSON.parse(content);

          // Validate the parsed config has expected structure
          if (parsed && typeof parsed === 'object') {
            return parsed;
          }
        } catch (e) {
          console.warn(`Failed to load config from ${configPath}:`, e);
        }
      }
    }

    return null;
  }

  private fileExists(filepath: string): boolean {
    try {
      return fs.existsSync(filepath);
    } catch {
      return false;
    }
  }

  /**
   * Get configuration documentation
   */
  static getConfigDocumentation(): string {
    return getElectrumXConfigDocumentation() + `

Legacy Environment Variables (Deprecated):
   ELECTRUMX_HOST=your-server.com
   ELECTRUMX_PORT=50002
   ELECTRUMX_PROTOCOL=ssl
   ELECTRUMX_ENDPOINTS=server1:50002:ssl,server2:50001:tcp
   TX_BUILDER_ELECTRUMX_CONFIG='[{"host":"server","port":50002,"protocol":"ssl"}]'
   TX_BUILDER_NETWORK=mainnet
   TX_BUILDER_CONNECTION_TIMEOUT=5000
   TX_BUILDER_REQUEST_TIMEOUT=30000
   TX_BUILDER_FALLBACK_TO_PUBLIC=true

Configuration File:
   Create .tx-builder.json or tx-builder.config.json in project root:
   {
     "endpoints": [{"host": "server", "port": 50002, "protocol": "ssl"}],
     "network": "mainnet",
     "fallbackToPublic": true
   }

Configuration Priority Order:
1. Runtime Configuration (Highest Priority): new ElectrumXProvider({ endpoints: [...] })
2. New Environment Variables (Recommended): ELECTRUMX_MAINNET_SERVERS, etc.
3. Configuration File: .tx-builder.json or tx-builder.config.json
4. Legacy Environment Variables (Deprecated)
5. Fallback Public Servers (Lowest Priority)
    `;
  }
}
