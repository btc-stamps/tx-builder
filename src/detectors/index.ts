/**
 * Ordinals Detectors
 *
 * External API integrations for detecting ordinals, inscriptions, and runes
 */

export {
  HiroOrdinalsDetector,
  type HiroOrdinalsDetectorOptions,
} from './hiro-ordinals-detector.ts';

export { OrdServerDetector, type OrdServerDetectorOptions } from './ord-server-detector.ts';

export { CounterpartyDetector, type CounterpartyDetectorOptions } from './counterparty-detector.ts';

export {
  type DetectionStrategy,
  OrdinalsMultiProviderDetector,
  type OrdinalsMultiProviderDetectorOptions,
} from './ordinals-multi-provider-detector.ts';

export {
  type AggregationStrategy,
  MultiAssetProtectionDetector,
  type MultiAssetProtectionDetectorOptions,
} from './multi-asset-protection-detector.ts';

export { MockOrdinalsDetector } from './mock-ordinals-detector.ts';
