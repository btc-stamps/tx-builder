/**
 * ElectrumX Configuration for tx-builder
 * Supports centralized configuration with environment variable support
 */

import type { Network } from 'bitcoinjs-lib';
import process from 'node:process';

export interface ElectrumXEndpoint {
  host: string;
  port: number;
  protocol: 'tcp' | 'ssl' | 'ws' | 'wss';
  maxRetries?: number;
  timeout?: number;
  priority?: number; // Lower number = higher priority
  description?: string; // Human-readable description
}

export interface ElectrumXConfig {
  endpoints: ElectrumXEndpoint[];
  network: Network;
  fallbackToPublic?: boolean;
  connectionTimeout?: number;
  requestTimeout?: number;
  maxRetries?: number;
}

/**
 * Default public mainnet ElectrumX/Electrs servers
 * These are high-performance, reliable servers validated through automated testing
 * Used when no custom servers are configured via environment variables
 * Sorted by performance (response time) for optimal connection reliability
 */
export const DEFAULT_MAINNET_SERVERS: ElectrumXEndpoint[] = [
  {
    host: 'blockstream.info',
    port: 50002,
    protocol: 'ssl',
    priority: 1,
    timeout: 10000,
    maxRetries: 3,
    description: 'Blockstream SSL (50002 - standard ElectrumX SSL port)',
  },
  {
    host: 'blockstream.info',
    port: 50001,
    protocol: 'tcp',
    priority: 2,
    timeout: 10000,
    maxRetries: 3,
    description: 'Blockstream TCP (50001 - standard ElectrumX TCP port)',
  },
  {
    host: 'fortress.qtornado.com',
    port: 443,
    protocol: 'ssl',
    priority: 3,
    timeout: 10000,
    maxRetries: 3,
    description: 'QTornado SSL (180ms avg) - Fast US server',
  },
  {
    host: 'electrum1.bluewallet.io',
    port: 443,
    protocol: 'ssl',
    priority: 4,
    timeout: 10000,
    maxRetries: 3,
    description: 'BlueWallet SSL (194ms avg) - Mobile optimized',
  },
  {
    host: 'bitcoin.aranguren.org',
    port: 50001,
    protocol: 'tcp',
    priority: 5,
    timeout: 10000,
    maxRetries: 3,
    description: 'BitKoyn TCP (stable)',
  },
  {
    host: 'btc.smsys.me',
    port: 50002,
    protocol: 'ssl',
    priority: 6,
    timeout: 10000,
    maxRetries: 3,
    description: '1209k SSL (backup)',
  },
];

/**
 * Legacy fallback name for backward compatibility
 * @deprecated Use DEFAULT_MAINNET_SERVERS instead
 */
export const FALLBACK_MAINNET_ENDPOINTS = DEFAULT_MAINNET_SERVERS;

/**
 * Default public testnet ElectrumX/Electrs servers
 * These are high-performance, reliable servers validated through automated testing
 * Used when no custom servers are configured via environment variables
 * Sorted by performance (response time) for optimal connection reliability
 */
export const DEFAULT_TESTNET_SERVERS: ElectrumXEndpoint[] = [
  {
    host: 'blockstream.info',
    port: 993,
    protocol: 'ssl',
    priority: 1,
    timeout: 10000,
    maxRetries: 3,
    description: 'Blockstream Testnet SSL (105ms avg) - Most reliable',
  },
  {
    host: 'blockstream.info',
    port: 143,
    protocol: 'tcp',
    priority: 2,
    timeout: 10000,
    maxRetries: 3,
    description: 'Blockstream Testnet TCP (107ms avg) - Primary TCP',
  },
  {
    host: 'testnet.qtornado.com',
    port: 51002,
    protocol: 'ssl',
    priority: 3,
    timeout: 10000,
    maxRetries: 3,
    description: 'QTornado Testnet SSL (192ms avg) - US server',
  },
  {
    host: 'testnet.aranguren.org',
    port: 51002,
    protocol: 'ssl',
    priority: 4,
    timeout: 10000,
    maxRetries: 3,
    description: 'SpeedWallet Testnet SSL (stable)',
  },
  {
    host: 'testnet.aranguren.org',
    port: 51001,
    protocol: 'tcp',
    priority: 5,
    timeout: 10000,
    maxRetries: 3,
    description: 'SpeedWallet Testnet TCP (backup)',
  },
];

/**
 * Legacy fallback name for backward compatibility
 * @deprecated Use DEFAULT_TESTNET_SERVERS instead
 */
export const FALLBACK_TESTNET_ENDPOINTS = DEFAULT_TESTNET_SERVERS;

/**
 * Default local regtest endpoints
 * Used when no custom servers are configured via environment variables
 * For local development and testing environments
 */
export const DEFAULT_REGTEST_SERVERS: ElectrumXEndpoint[] = [
  {
    host: 'localhost',
    port: 50001,
    protocol: 'tcp',
    priority: 1,
    timeout: 5000,
    maxRetries: 2,
    description: 'Local regtest server (localhost)',
  },
  {
    host: '127.0.0.1',
    port: 50001,
    protocol: 'tcp',
    priority: 2,
    timeout: 5000,
    maxRetries: 2,
    description: 'Local regtest server (IP)',
  },
];

/**
 * Legacy fallback name for backward compatibility
 * @deprecated Use DEFAULT_REGTEST_SERVERS instead
 */
export const FALLBACK_REGTEST_ENDPOINTS = DEFAULT_REGTEST_SERVERS;

/**
 * Parse ElectrumX servers from environment variable string
 * Format: "host1:port1:protocol1,host2:port2:protocol2"
 * Example: "electrum.blockstream.info:50002:ssl,fortress.qtornado.com:443:ssl"
 */
export function parseServersFromEnv(envString: string): ElectrumXEndpoint[] {
  const endpoints: ElectrumXEndpoint[] = [];

  if (!envString || envString.trim() === '') {
    return endpoints;
  }

  const serverStrings = envString.split(',');
  serverStrings.forEach((serverString, index) => {
    const parts = serverString.trim().split(':');
    if (parts.length >= 2) {
      const host = parts[0]?.trim();
      const port = parseInt(parts[1]?.trim() || '0');
      const protocol = parts[2]?.trim() as 'tcp' | 'ssl' | 'ws' | 'wss' ||
        'ssl';

      if (host && !isNaN(port) && port > 0 && port <= 65535) {
        endpoints.push({
          host,
          port,
          protocol,
          priority: index + 1,
          description: `Environment server ${index + 1}`,
        });
      } else {
        console.warn(`Invalid ElectrumX server format: ${serverString}`);
      }
    }
  });

  return endpoints;
}

/**
 * Get ElectrumX endpoints with smart configuration loading
 * Priority: Network-specific env vars > Generic env vars > High-performance defaults
 * Logs which configuration source is being used for debugging
 */
export function getElectrumXEndpoints(
  networkName: string,
): ElectrumXEndpoint[] {
  const network = networkName.toLowerCase();

  // Check for network-specific environment variables first
  let envServers: ElectrumXEndpoint[] = [];
  let configSource = '';

  switch (network) {
    case 'mainnet':
    case 'bitcoin':
      if (process.env.ELECTRUMX_MAINNET_SERVERS) {
        envServers = parseServersFromEnv(process.env.ELECTRUMX_MAINNET_SERVERS);
        configSource = 'ELECTRUMX_MAINNET_SERVERS environment variable';
      }
      break;
    case 'testnet':
    case 'testnet3':
      if (process.env.ELECTRUMX_TESTNET_SERVERS) {
        envServers = parseServersFromEnv(process.env.ELECTRUMX_TESTNET_SERVERS);
        configSource = 'ELECTRUMX_TESTNET_SERVERS environment variable';
      }
      break;
    case 'regtest':
    case 'regtest1':
      if (process.env.ELECTRUMX_REGTEST_SERVERS) {
        envServers = parseServersFromEnv(process.env.ELECTRUMX_REGTEST_SERVERS);
        configSource = 'ELECTRUMX_REGTEST_SERVERS environment variable';
      }
      break;
  }

  // Fall back to generic ELECTRUMX_SERVERS if no network-specific servers
  if (envServers.length === 0 && process.env.ELECTRUMX_SERVERS) {
    envServers = parseServersFromEnv(process.env.ELECTRUMX_SERVERS);
    configSource = 'ELECTRUMX_SERVERS environment variable';
  }

  // Return environment servers if found
  if (envServers.length > 0) {
    console.log(
      `ElectrumX: Using ${envServers.length} server(s) from ${configSource}`,
    );
    return envServers;
  }

  // Return high-performance defaults based on network
  const defaults = getDefaultEndpoints(network);
  console.log(
    `ElectrumX: Using ${defaults.length} default ${network} server(s) (no environment config found)`,
  );
  return defaults;
}

/**
 * Get default high-performance endpoints for a given network
 * Returns validated, fast public servers when no custom configuration is provided
 */
export function getDefaultEndpoints(networkName: string): ElectrumXEndpoint[] {
  switch (networkName.toLowerCase()) {
    case 'testnet':
    case 'testnet3':
      return [...DEFAULT_TESTNET_SERVERS];
    case 'regtest':
    case 'regtest1':
      return [...DEFAULT_REGTEST_SERVERS];
    case 'mainnet':
    case 'bitcoin':
    default:
      return [...DEFAULT_MAINNET_SERVERS];
  }
}

/**
 * Legacy fallback function for backward compatibility
 * @deprecated Use getDefaultEndpoints instead
 */
export function getFallbackEndpoints(networkName: string): ElectrumXEndpoint[] {
  console.warn(
    'getFallbackEndpoints is deprecated, use getDefaultEndpoints instead',
  );
  return getDefaultEndpoints(networkName);
}

/**
 * Validate endpoint configuration
 */
export function validateEndpoint(endpoint: ElectrumXEndpoint): string[] {
  const errors: string[] = [];

  if (!endpoint.host) {
    errors.push('Endpoint host is required');
  }

  if (!endpoint.port || endpoint.port < 1 || endpoint.port > 65535) {
    errors.push('Endpoint port must be between 1 and 65535');
  }

  if (!['tcp', 'ssl', 'ws', 'wss'].includes(endpoint.protocol)) {
    errors.push('Endpoint protocol must be one of: tcp, ssl, ws, wss');
  }

  if (endpoint.timeout && endpoint.timeout < 1000) {
    errors.push('Endpoint timeout must be at least 1000ms');
  }

  if (endpoint.maxRetries && endpoint.maxRetries < 0) {
    errors.push('Endpoint maxRetries cannot be negative');
  }

  return errors;
}

/**
 * Validate configuration
 */
export function validateConfig(config: ElectrumXConfig): string[] {
  const errors: string[] = [];

  if (!config.endpoints || config.endpoints.length === 0) {
    errors.push('At least one endpoint is required');
  } else {
    config.endpoints.forEach((endpoint, index) => {
      const endpointErrors = validateEndpoint(endpoint);
      endpointErrors.forEach((error) => {
        errors.push(`Endpoint ${index}: ${error}`);
      });
    });
  }

  if (!config.network) {
    errors.push('Network is required');
  }

  if (config.connectionTimeout && config.connectionTimeout < 1000) {
    errors.push('Connection timeout must be at least 1000ms');
  }

  if (config.requestTimeout && config.requestTimeout < 1000) {
    errors.push('Request timeout must be at least 1000ms');
  }

  return errors;
}

/**
 * Load ElectrumX configuration from environment variables
 */
export function loadElectrumXConfigFromEnv(): Partial<ElectrumXConfig> {
  const config: Partial<ElectrumXConfig> = {};

  // Connection timeout
  if (process.env.ELECTRUMX_TIMEOUT) {
    const timeout = parseInt(process.env.ELECTRUMX_TIMEOUT);
    if (!isNaN(timeout) && timeout > 0) {
      config.connectionTimeout = timeout;
      config.requestTimeout = timeout;
    }
  }

  // Max retries
  if (process.env.ELECTRUMX_MAX_RETRIES) {
    const retries = parseInt(process.env.ELECTRUMX_MAX_RETRIES);
    if (!isNaN(retries) && retries >= 0) {
      config.maxRetries = retries;
    }
  }

  // Fallback to public servers
  if (process.env.ELECTRUMX_FALLBACK_TO_PUBLIC !== undefined) {
    config.fallbackToPublic = process.env.ELECTRUMX_FALLBACK_TO_PUBLIC.toLowerCase() === 'true';
  }

  return config;
}

/**
 * Create a complete ElectrumX configuration for a network
 */
export function createElectrumXConfig(network: Network): ElectrumXConfig {
  const networkName = getNetworkName(network);
  const envConfig = loadElectrumXConfigFromEnv();
  const endpoints = getElectrumXEndpoints(networkName);

  const config: ElectrumXConfig = {
    endpoints,
    network,
    fallbackToPublic: true,
    connectionTimeout: 10000, // 10 seconds
    requestTimeout: 30000, // 30 seconds
    maxRetries: 3,
    ...envConfig,
  };

  // Validate the configuration
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid ElectrumX configuration: ${errors.join(', ')}`);
  }

  return config;
}

/**
 * Get network name from Network object or string
 */
function getNetworkName(network: Network | string): string {
  if (typeof network === 'string') {
    return network;
  }

  // Handle bitcoinjs-lib Network objects
  if (network && typeof network === 'object') {
    // Check bech32 prefix to determine network
    if ('bech32' in network) {
      switch (network.bech32) {
        case 'bc':
          return 'mainnet';
        case 'tb':
          return 'testnet';
        case 'bcrt':
          return 'regtest';
      }
    }

    // Check message prefix as fallback
    if (
      'messagePrefix' in network && typeof network.messagePrefix === 'string'
    ) {
      if (network.messagePrefix.includes('Bitcoin Signed Message')) {
        return 'mainnet';
      }
      if (network.messagePrefix.includes('testnet')) {
        return 'testnet';
      }
      if (network.messagePrefix.includes('regtest')) {
        return 'regtest';
      }
    }
  }

  // Default to mainnet if unable to determine
  return 'mainnet';
}

/**
 * Get configuration documentation with environment variable examples
 */
export function getElectrumXConfigDocumentation(): string {
  return `
ElectrumX Server Configuration

Environment Variables (recommended):

Network-specific servers (highest priority):
  ELECTRUMX_MAINNET_SERVERS="server1.example.com:50002:ssl,server2.example.com:50001:tcp"
  ELECTRUMX_TESTNET_SERVERS="testnet1.example.com:50002:ssl,testnet2.example.com:50001:tcp"
  ELECTRUMX_REGTEST_SERVERS="localhost:50001:tcp,127.0.0.1:50001:tcp"

Generic servers (medium priority):
  ELECTRUMX_SERVERS="server1.example.com:50002:ssl,server2.example.com:50001:tcp"

Connection settings:
  ELECTRUMX_TIMEOUT=10000              # Connection and request timeout in ms (default: 10000)
  ELECTRUMX_MAX_RETRIES=3              # Maximum retry attempts (default: 3)
  ELECTRUMX_FALLBACK_TO_PUBLIC=true    # Use fallback servers if custom fail (default: true)

Server format: "host:port:protocol"
Supported protocols: tcp, ssl, ws, wss

Examples:
  # Production mainnet setup
  ELECTRUMX_MAINNET_SERVERS="electrum.mycompany.com:50002:ssl,backup.mycompany.com:50002:ssl"
  ELECTRUMX_TIMEOUT=15000
  ELECTRUMX_MAX_RETRIES=5
  
  # Development with local regtest
  ELECTRUMX_REGTEST_SERVERS="localhost:50001:tcp"
  ELECTRUMX_FALLBACK_TO_PUBLIC=false

  # Multi-network with specific servers
  ELECTRUMX_MAINNET_SERVERS="mainnet.example.com:50002:ssl"
  ELECTRUMX_TESTNET_SERVERS="testnet.example.com:50002:ssl"
  ELECTRUMX_REGTEST_SERVERS="localhost:50001:tcp"

Fallback behavior:
- If no environment variables are set, uses reliable public servers
- Network-specific env vars override generic ELECTRUMX_SERVERS
- Custom servers are always tried before fallback servers
`;
}
