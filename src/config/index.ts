/**
 * Configuration module exports
 */

export {
  createElectrumXConfig,
  type ElectrumXConfig,
  type ElectrumXEndpoint,
  FALLBACK_MAINNET_ENDPOINTS,
  FALLBACK_REGTEST_ENDPOINTS,
  FALLBACK_TESTNET_ENDPOINTS,
  getDefaultEndpoints,
  getElectrumXEndpoints,
  loadElectrumXConfigFromEnv,
  parseServersFromEnv,
  validateConfig,
  validateEndpoint,
} from './electrumx-config.ts';

export { ConfigLoader } from './config-loader.ts';
