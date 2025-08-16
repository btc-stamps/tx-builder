/**
 * Environment Variable Configuration Validator for ElectrumX
 * Provides comprehensive validation and configuration loading with clear error messages
 */

import process from 'node:process';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  config: Record<string, any>;
}

export interface ElectrumXEnvConfig {
  // Server configuration
  mainnetServers?: string | undefined;
  testnetServers?: string | undefined;
  regtestServers?: string | undefined;
  genericServers?: string | undefined;

  // Connection settings
  timeout?: number | undefined;
  maxRetries?: number | undefined;
  fallbackToPublic?: boolean | undefined;

  // Pool configuration
  poolSize?: number | undefined;
  healthCheckInterval?: number | undefined;
  circuitBreakerThreshold?: number | undefined;

  // Fee provider settings
  fallbackFeeRate?: number | undefined;
  feeCacheTimeout?: number | undefined;

  // Network setting
  network?: string | undefined;

  // Legacy settings (deprecated)
  legacyHost?: string | undefined;
  legacyPort?: number | undefined;
  legacyProtocol?: string | undefined;
  legacyEndpoints?: string | undefined;
}

/**
 * Standardized ElectrumX environment variable names with validation rules
 */
export const ELECTRUMX_ENV_VARS = {
  // Network-specific servers (highest priority)
  ELECTRUMX_MAINNET_SERVERS: {
    type: 'servers' as const,
    description: 'Mainnet ElectrumX server list in format: host:port:protocol,host:port:protocol',
    example: 'electrum.example.com:50002:ssl,backup.example.com:50002:ssl',
    required: false,
  },
  ELECTRUMX_TESTNET_SERVERS: {
    type: 'servers' as const,
    description: 'Testnet ElectrumX server list in format: host:port:protocol,host:port:protocol',
    example: 'testnet.example.com:50002:ssl,testnet-backup.example.com:50002:ssl',
    required: false,
  },
  ELECTRUMX_REGTEST_SERVERS: {
    type: 'servers' as const,
    description: 'Regtest ElectrumX server list in format: host:port:protocol,host:port:protocol',
    example: 'localhost:50001:tcp,127.0.0.1:50001:tcp',
    required: false,
  },

  // Generic servers (fallback)
  ELECTRUMX_SERVERS: {
    type: 'servers' as const,
    description: 'Generic ElectrumX server list (used if network-specific not set)',
    example: 'generic.example.com:50002:ssl,backup.example.com:50002:ssl',
    required: false,
  },

  // Connection settings
  ELECTRUMX_TIMEOUT: {
    type: 'number' as const,
    description: 'Connection and request timeout in milliseconds',
    example: '10000',
    required: false,
    min: 1000,
    max: 300000, // 5 minutes max
    default: 10000,
  },
  ELECTRUMX_MAX_RETRIES: {
    type: 'number' as const,
    description: 'Maximum retry attempts for failed requests',
    example: '3',
    required: false,
    min: 0,
    max: 10,
    default: 3,
  },
  ELECTRUMX_FALLBACK_TO_PUBLIC: {
    type: 'boolean' as const,
    description: 'Whether to use public fallback servers if custom servers fail',
    example: 'true',
    required: false,
    default: true,
  },

  // Pool configuration
  ELECTRUMX_POOL_SIZE: {
    type: 'number' as const,
    description: 'Maximum connections per ElectrumX server',
    example: '3',
    required: false,
    min: 1,
    max: 20,
    default: 3,
  },
  ELECTRUMX_HEALTH_CHECK_INTERVAL: {
    type: 'number' as const,
    description: 'Health check interval in milliseconds',
    example: '30000',
    required: false,
    min: 5000, // 5 seconds min
    max: 300000, // 5 minutes max
    default: 30000,
  },
  ELECTRUMX_CIRCUIT_BREAKER_THRESHOLD: {
    type: 'number' as const,
    description: 'Number of consecutive failures before opening circuit breaker',
    example: '5',
    required: false,
    min: 1,
    max: 20,
    default: 5,
  },

  // Fee provider settings
  ELECTRUMX_FALLBACK_FEE_RATE: {
    type: 'number' as const,
    description: 'Fallback fee rate in sat/vB when fee estimation fails',
    example: '10',
    required: false,
    min: 1,
    max: 1000,
    default: 10,
  },
  ELECTRUMX_FEE_CACHE_TIMEOUT: {
    type: 'number' as const,
    description: 'Fee estimation cache timeout in seconds',
    example: '60',
    required: false,
    min: 10,
    max: 3600, // 1 hour max
    default: 60,
  },

  // Network selection
  TX_BUILDER_NETWORK: {
    type: 'string' as const,
    description: 'Bitcoin network to use (mainnet, testnet, regtest)',
    example: 'mainnet',
    required: false,
    enum: ['mainnet', 'testnet', 'regtest', 'bitcoin', 'testnet3', 'regtest1'],
    default: 'mainnet',
  },

  // Legacy variables (deprecated but supported)
  ELECTRUMX_HOST: {
    type: 'string' as const,
    description: '[DEPRECATED] Single ElectrumX server host',
    example: 'electrum.example.com',
    required: false,
    deprecated: true,
    replacement: 'ELECTRUMX_MAINNET_SERVERS',
  },
  ELECTRUMX_PORT: {
    type: 'number' as const,
    description: '[DEPRECATED] Single ElectrumX server port',
    example: '50002',
    required: false,
    min: 1,
    max: 65535,
    deprecated: true,
    replacement: 'ELECTRUMX_MAINNET_SERVERS',
  },
  ELECTRUMX_PROTOCOL: {
    type: 'string' as const,
    description: '[DEPRECATED] Single ElectrumX server protocol',
    example: 'ssl',
    required: false,
    enum: ['tcp', 'ssl', 'ws', 'wss'],
    deprecated: true,
    replacement: 'ELECTRUMX_MAINNET_SERVERS',
  },
  ELECTRUMX_ENDPOINTS: {
    type: 'servers' as const,
    description: '[DEPRECATED] Comma-separated ElectrumX endpoints',
    example: 'server1.com:50002:ssl,server2.com:50001:tcp',
    required: false,
    deprecated: true,
    replacement: 'ELECTRUMX_MAINNET_SERVERS',
  },
} as const;

/**
 * Validate server string format
 */
function validateServerString(
  serverString: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!serverString || serverString.trim() === '') {
    return { valid: false, errors: ['Server string cannot be empty'] };
  }

  const servers = serverString.split(',');

  for (const [index, server] of servers.entries()) {
    const parts = server.trim().split(':');

    if (parts.length < 2) {
      errors.push(
        `Server ${index + 1}: Invalid format. Expected "host:port" or "host:port:protocol"`,
      );
      continue;
    }

    const [host, portStr, protocol] = parts;

    // Validate host
    if (!host || host.trim() === '') {
      errors.push(`Server ${index + 1}: Host cannot be empty`);
    } else if (!/^[a-zA-Z0-9.-]+$/.test(host.trim())) {
      errors.push(`Server ${index + 1}: Invalid host format "${host.trim()}"`);
    }

    // Validate port
    if (!portStr) {
      errors.push(`Server ${index + 1}: Port is required`);
    } else {
      const port = parseInt(portStr);
      if (isNaN(port) || port < 1 || port > 65535) {
        errors.push(
          `Server ${index + 1}: Invalid port "${portStr}". Must be 1-65535`,
        );
      }
    }

    // Validate protocol (optional)
    if (protocol && !['tcp', 'ssl', 'ws', 'wss'].includes(protocol.trim())) {
      errors.push(
        `Server ${index + 1}: Invalid protocol "${protocol}". Must be tcp, ssl, ws, or wss`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate boolean environment variable
 */
function validateBoolean(
  value: string,
  varName: string,
): { valid: boolean; errors: string[]; parsed?: boolean | undefined } {
  const normalized = value.toLowerCase().trim();

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return { valid: true, errors: [], parsed: true };
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return { valid: true, errors: [], parsed: false };
  }

  return {
    valid: false,
    errors: [
      `${varName}: Invalid boolean value "${value}". Use: true/false, 1/0, yes/no, on/off`,
    ],
  };
}

/**
 * Validate number environment variable
 */
function validateNumber(
  value: string,
  varName: string,
  options: { min?: number; max?: number } = {},
): { valid: boolean; errors: string[]; parsed?: number | undefined } {
  const parsed = parseInt(value);
  const errors: string[] = [];

  if (isNaN(parsed)) {
    return {
      valid: false,
      errors: [`${varName}: Invalid number "${value}"`],
    };
  }

  if (options.min !== undefined && parsed < options.min) {
    errors.push(`${varName}: Value ${parsed} is below minimum ${options.min}`);
  }

  if (options.max !== undefined && parsed > options.max) {
    errors.push(`${varName}: Value ${parsed} is above maximum ${options.max}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : undefined,
  };
}

/**
 * Validate enum environment variable
 */
function validateEnum(
  value: string,
  varName: string,
  allowedValues: readonly string[],
): { valid: boolean; errors: string[]; parsed?: string } {
  const normalized = value.toLowerCase().trim();

  if (allowedValues.includes(normalized)) {
    return { valid: true, errors: [], parsed: normalized };
  }

  return {
    valid: false,
    errors: [
      `${varName}: Invalid value "${value}". Allowed: ${allowedValues.join(', ')}`,
    ],
  };
}

/**
 * Load and validate ElectrumX environment configuration
 */
export function loadElectrumXEnvironmentConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config: ElectrumXEnvConfig = {};

  // Check for deprecated variables
  const deprecatedVars = Object.entries(ELECTRUMX_ENV_VARS)
    .filter(([, spec]) => 'deprecated' in spec && spec.deprecated)
    .map(([name]) => name);

  for (const varName of deprecatedVars) {
    if (process.env[varName]) {
      const spec = ELECTRUMX_ENV_VARS[varName as keyof typeof ELECTRUMX_ENV_VARS];
      const replacement = 'replacement' in spec ? spec.replacement : 'new environment variables';
      warnings.push(
        `${varName} is deprecated. Use ${replacement || 'new environment variables'} instead.`,
      );
    }
  }

  // Validate server configurations
  const serverVars = [
    'ELECTRUMX_MAINNET_SERVERS',
    'ELECTRUMX_TESTNET_SERVERS',
    'ELECTRUMX_REGTEST_SERVERS',
    'ELECTRUMX_SERVERS',
    'ELECTRUMX_ENDPOINTS',
  ] as const;

  for (const varName of serverVars) {
    const value = process.env[varName];
    if (value) {
      const validation = validateServerString(value);
      if (!validation.valid) {
        errors.push(...validation.errors.map((err) => `${varName}: ${err}`));
      } else {
        switch (varName) {
          case 'ELECTRUMX_MAINNET_SERVERS':
            config.mainnetServers = value;
            break;
          case 'ELECTRUMX_TESTNET_SERVERS':
            config.testnetServers = value;
            break;
          case 'ELECTRUMX_REGTEST_SERVERS':
            config.regtestServers = value;
            break;
          case 'ELECTRUMX_SERVERS':
            config.genericServers = value;
            break;
          case 'ELECTRUMX_ENDPOINTS':
            config.legacyEndpoints = value;
            break;
        }
      }
    }
  }

  // Validate timeout
  if (process.env.ELECTRUMX_TIMEOUT) {
    const validation = validateNumber(
      process.env.ELECTRUMX_TIMEOUT,
      'ELECTRUMX_TIMEOUT',
      { min: 1000, max: 300000 },
    );
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      config.timeout = validation.parsed;
    }
  }

  // Validate max retries
  if (process.env.ELECTRUMX_MAX_RETRIES) {
    const validation = validateNumber(
      process.env.ELECTRUMX_MAX_RETRIES,
      'ELECTRUMX_MAX_RETRIES',
      { min: 0, max: 10 },
    );
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      config.maxRetries = validation.parsed;
    }
  }

  // Validate fallback to public
  if (process.env.ELECTRUMX_FALLBACK_TO_PUBLIC) {
    const validation = validateBoolean(
      process.env.ELECTRUMX_FALLBACK_TO_PUBLIC,
      'ELECTRUMX_FALLBACK_TO_PUBLIC',
    );
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      config.fallbackToPublic = validation.parsed;
    }
  }

  // Validate pool size
  if (process.env.ELECTRUMX_POOL_SIZE) {
    const validation = validateNumber(
      process.env.ELECTRUMX_POOL_SIZE,
      'ELECTRUMX_POOL_SIZE',
      { min: 1, max: 20 },
    );
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      config.poolSize = validation.parsed;
    }
  }

  // Validate health check interval
  if (process.env.ELECTRUMX_HEALTH_CHECK_INTERVAL) {
    const validation = validateNumber(
      process.env.ELECTRUMX_HEALTH_CHECK_INTERVAL,
      'ELECTRUMX_HEALTH_CHECK_INTERVAL',
      { min: 5000, max: 300000 },
    );
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      config.healthCheckInterval = validation.parsed;
    }
  }

  // Validate circuit breaker threshold
  if (process.env.ELECTRUMX_CIRCUIT_BREAKER_THRESHOLD) {
    const validation = validateNumber(
      process.env.ELECTRUMX_CIRCUIT_BREAKER_THRESHOLD,
      'ELECTRUMX_CIRCUIT_BREAKER_THRESHOLD',
      { min: 1, max: 20 },
    );
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      config.circuitBreakerThreshold = validation.parsed;
    }
  }

  // Validate fallback fee rate
  if (process.env.ELECTRUMX_FALLBACK_FEE_RATE) {
    const validation = validateNumber(
      process.env.ELECTRUMX_FALLBACK_FEE_RATE,
      'ELECTRUMX_FALLBACK_FEE_RATE',
      { min: 1, max: 1000 },
    );
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      config.fallbackFeeRate = validation.parsed;
    }
  }

  // Validate fee cache timeout
  if (process.env.ELECTRUMX_FEE_CACHE_TIMEOUT) {
    const validation = validateNumber(
      process.env.ELECTRUMX_FEE_CACHE_TIMEOUT,
      'ELECTRUMX_FEE_CACHE_TIMEOUT',
      { min: 10, max: 3600 },
    );
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      config.feeCacheTimeout = validation.parsed;
    }
  }

  // Validate network
  if (process.env.TX_BUILDER_NETWORK) {
    const validation = validateEnum(
      process.env.TX_BUILDER_NETWORK,
      'TX_BUILDER_NETWORK',
      ['mainnet', 'testnet', 'regtest', 'bitcoin', 'testnet3', 'regtest1'],
    );
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      config.network = validation.parsed;
    }
  }

  // Validate legacy host
  if (process.env.ELECTRUMX_HOST) {
    config.legacyHost = process.env.ELECTRUMX_HOST;
  }

  // Validate legacy port
  if (process.env.ELECTRUMX_PORT) {
    const validation = validateNumber(
      process.env.ELECTRUMX_PORT,
      'ELECTRUMX_PORT',
      { min: 1, max: 65535 },
    );
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      config.legacyPort = validation.parsed;
    }
  }

  // Validate legacy protocol
  if (process.env.ELECTRUMX_PROTOCOL) {
    const validation = validateEnum(
      process.env.ELECTRUMX_PROTOCOL,
      'ELECTRUMX_PROTOCOL',
      ['tcp', 'ssl', 'ws', 'wss'],
    );
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      config.legacyProtocol = validation.parsed;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    config,
  };
}

/**
 * Get comprehensive configuration documentation
 */
export function getEnvironmentConfigDocumentation(): string {
  const sections = Object.entries(ELECTRUMX_ENV_VARS).map(([name, spec]) => {
    const deprecatedLabel = 'deprecated' in spec && spec.deprecated ? ' [DEPRECATED]' : '';
    const requiredLabel = spec.required ? ' (Required)' : ' (Optional)';
    const defaultValue = 'default' in spec && spec.default !== undefined
      ? ` (Default: ${spec.default})`
      : '';

    let validationInfo = '';
    if (spec.type === 'number' && ('min' in spec || 'max' in spec)) {
      const min = 'min' in spec && spec.min !== undefined ? `Min: ${spec.min}` : '';
      const max = 'max' in spec && spec.max !== undefined ? `Max: ${spec.max}` : '';
      validationInfo = ` [${[min, max].filter(Boolean).join(', ')}]`;
    }

    if ('enum' in spec && spec.enum) {
      validationInfo = ` [Values: ${spec.enum.join(', ')}]`;
    }

    const replacement = 'replacement' in spec && spec.replacement
      ? `\n  Use ${spec.replacement} instead`
      : '';

    return `${name}${deprecatedLabel}${requiredLabel}${defaultValue}${validationInfo}
  ${spec.description}
  Example: ${name}=${spec.example}${replacement}`;
  });

  return `# ElectrumX Environment Variable Configuration Guide

## Current Environment Variables

${sections.join('\n\n')}

## Configuration Validation

Use loadElectrumXEnvironmentConfig() to validate your environment:
- Checks all variable formats and ranges
- Provides clear error messages for invalid values
- Warns about deprecated variables
- Returns parsed configuration object

## Migration Guide

If you're using deprecated variables, migrate as follows:
- ELECTRUMX_HOST/PORT/PROTOCOL → ELECTRUMX_MAINNET_SERVERS
- ELECTRUMX_ENDPOINTS → ELECTRUMX_MAINNET_SERVERS
- Use network-specific variables for multi-environment setups

## Best Practices

1. Use network-specific variables for production deployments
2. Set reasonable timeout and retry values for your environment
3. Enable fallback to public servers for development only
4. Monitor health check intervals and circuit breaker thresholds
5. Set appropriate pool sizes based on expected load
`;
}

/**
 * Validate configuration and provide detailed error reporting
 */
export function validateElectrumXConfiguration(
  throwOnError = true,
): ValidationResult {
  const result = loadElectrumXEnvironmentConfig();

  if (!result.valid && throwOnError) {
    const errorMessage = [
      'ElectrumX configuration validation failed:',
      ...result.errors,
      ...(result.warnings.length > 0 ? ['Warnings:'] : []),
      ...result.warnings,
      '',
      'See getEnvironmentConfigDocumentation() for configuration details.',
    ].join('\n');

    throw new Error(errorMessage);
  }

  if (result.warnings.length > 0) {
    console.warn('ElectrumX configuration warnings:');
    for (const warning of result.warnings) {
      console.warn(`  - ${warning}`);
    }
  }

  return result;
}
