/**
 * Asset Validation Service
 *
 * Provides Bitcoin Stamp asset name validation and generation functionality.
 * Integrates with Counterparty API to check asset availability and generate
 * collision-free asset names.
 *
 * Based on BTCStampsExplorer/server/services/stamp/stampValidationService.ts
 */

/**
 * JSON-RPC 2.0 response wrapper
 */
interface JsonRpcResponse<T = any> {
  jsonrpc: '2.0';
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number | string;
}

/**
 * Configuration options for asset validation
 */
export interface AssetValidationConfig {
  /** Maximum iterations when generating available asset names */
  maxIterations?: number;
  /** Minimum asset ID for A-prefixed numeric assets */
  minAssetId?: bigint;
  /** Maximum asset ID for A-prefixed numeric assets */
  maxAssetId?: bigint;
  /** Timeout for API requests in milliseconds */
  timeout?: number;
  /** Base URL for Counterparty API */
  apiUrl?: string;
  /** Maximum number of retries for API requests */
  maxRetries?: number;
}

/**
 * Result of asset validation operations
 */
export interface AssetValidationResult {
  /** Whether the asset name format is valid */
  isValid: boolean;
  /** Whether the asset is available for registration */
  isAvailable: boolean;
  /** Normalized asset name */
  normalizedName: string;
  /** List of validation errors */
  errors: string[];
  /** List of validation warnings */
  warnings: string[];
}

/**
 * Bitcoin Stamp Asset Validation Service
 *
 * Handles:
 * - Asset name format validation (A-prefixed numeric and alphabetic names)
 * - Asset availability checking via Counterparty API
 * - Available asset name generation with collision avoidance
 * - CPID format validation for Bitcoin Stamps
 */
export class AssetValidationService {
  private readonly config: Required<AssetValidationConfig>;

  constructor(config?: AssetValidationConfig) {
    this.config = {
      maxIterations: config?.maxIterations || 100,
      minAssetId: config?.minAssetId || (26n ** 12n + 1n), // Start after alphabetic assets
      maxAssetId: config?.maxAssetId || (2n ** 64n - 1n), // Max 64-bit integer
      timeout: config?.timeout || 5000,
      apiUrl: config?.apiUrl || 'https://api.counterparty.io:4000',
      maxRetries: config?.maxRetries || 3,
    };
  }

  /**
   * Validate and prepare an asset name for use
   *
   * @param assetName Optional asset name to validate, generates one if not provided
   * @returns Promise<string> Valid, available asset name
   * @throws Error if validation fails or no available asset can be generated
   */
  async validateAndPrepareAssetName(assetName?: string): Promise<string> {
    if (assetName) {
      const normalized = assetName.toUpperCase();

      // Reject alphabetic (named) assets that require XCP burn
      if (/^[B-Z][A-Z0-9]*$/.test(normalized) && !normalized.startsWith('A')) {
        throw new Error(
          `Named asset "${normalized}" requires burning 0.5 XCP tokens. ` +
            `Bitcoin Stamps must use A-prefixed numeric assets (e.g., A95428956662000000). ` +
            `Call this method without an asset name to generate a valid numeric asset automatically.`,
        );
      }

      // Validate provided asset name
      const validation = await this.validateAssetName(assetName);

      if (!validation.isValid) {
        throw new Error(`Invalid asset name: ${validation.errors.join(', ')}`);
      }

      if (!validation.isAvailable) {
        throw new Error(`Asset name '${assetName}' is already taken`);
      }

      return validation.normalizedName;
    } else {
      // Generate new available asset name
      return await this.generateAvailableAssetName();
    }
  }

  /**
   * Check if an asset is available for registration
   *
   * @param assetName Asset name to check
   * @returns Promise<boolean> True if asset is available
   */
  async checkAssetAvailability(assetName: string): Promise<boolean> {
    try {
      const assetInfo = await this.getAssetInfo(assetName);
      // If API returns null, asset is available
      return assetInfo === null;
    } catch (error) {
      console.warn(
        `Error checking asset availability for ${assetName}:`,
        error instanceof Error ? error.message : String(error),
      );
      // On error, assume unavailable for safety
      return false;
    }
  }

  /**
   * Generate an available asset name
   *
   * @returns Promise<string> Available A-prefixed numeric asset name
   * @throws Error if no available asset can be generated within maxIterations
   */
  async generateAvailableAssetName(): Promise<string> {
    for (let i = 0; i < this.config.maxIterations; i++) {
      // Generate random asset ID in valid range
      const assetId = this.generateRandomBigInt(
        this.config.minAssetId,
        this.config.maxAssetId,
      );

      const assetName = `A${assetId.toString()}`;

      // Check if this asset is available
      const isAvailable = await this.checkAssetAvailability(assetName);

      if (isAvailable) {
        console.log(`Generated available asset name: ${assetName}`);
        return assetName;
      }

      console.debug(`Asset ${assetName} is taken, trying another...`);
    }

    throw new Error(
      `Failed to generate available asset name after ${this.config.maxIterations} attempts`,
    );
  }

  /**
   * Validate asset name format and availability
   *
   * @param assetName Asset name to validate
   * @returns Promise<AssetValidationResult> Validation result
   */
  async validateAssetName(assetName: string): Promise<AssetValidationResult> {
    const result: AssetValidationResult = {
      isValid: false,
      isAvailable: false,
      normalizedName: assetName.toUpperCase(),
      errors: [],
      warnings: [],
    };

    // Format validation
    if (!this.isValidCPID(assetName)) {
      result.errors.push(
        'Invalid asset name format. Expected A-prefixed numeric (e.g., A95428956662000000) or alphabetic name (max 13 chars)',
      );
      return result;
    }

    // Check for alphabetic (named) assets that require XCP burn
    const normalized = assetName.toUpperCase();
    if (/^[B-Z][A-Z0-9]*$/.test(normalized) && !normalized.startsWith('A')) {
      result.errors.push(
        `Named asset "${normalized}" requires burning 0.5 XCP tokens. ` +
          `Bitcoin Stamps should use A-prefixed numeric assets (e.g., A95428956662000000) which don't require XCP burn. ` +
          `Use generateAvailableAssetName() to get a valid numeric asset.`,
      );
      return result;
    }

    result.isValid = true;

    // Check availability directly using our internal API client
    try {
      const assetInfo = await this.getAssetInfo(result.normalizedName);
      result.isAvailable = assetInfo === null;

      if (!result.isAvailable) {
        result.warnings.push('Asset name is already registered');
      }
    } catch (error) {
      result.errors.push(
        `Failed to check asset availability: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      result.isAvailable = false;
      result.isValid = false; // If we can't check availability due to error, consider invalid
    }

    return result;
  }

  /**
   * Get asset information for a specific asset name
   * Used for asset availability checking
   */
  private async getAssetInfo(assetName: string): Promise<any | null> {
    const rpcRequest = {
      jsonrpc: '2.0',
      method: 'get_asset_info',
      params: {
        assets: [assetName],
      },
      id: 1,
    };

    const response = await this.callCounterpartyAPI(rpcRequest);

    if (!response.ok) {
      if (response.status === 404) {
        // 404 means asset not found - asset is available
        return null;
      }
      // Other errors should be logged but not throw
      console.warn(`Counterparty API error ${response.status} for asset ${assetName}`);
      return null;
    }

    const data: JsonRpcResponse<any> = await response.json();

    // Check for JSON-RPC error
    if (data.error) {
      console.warn(`Counterparty API JSON-RPC error for asset ${assetName}: ${data.error.message}`);
      return null;
    }

    // Return first result if available, null if empty array
    return data.result && data.result.length > 0 ? data.result[0] : null;
  }

  /**
   * Call Counterparty API with retry logic and exponential backoff
   */
  private async callCounterpartyAPI(
    rpcRequest: any,
    attempt: number = 1,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'tx-builder/0.1.0',
        },
        body: JSON.stringify(rpcRequest),
      });

      clearTimeout(timeoutId);

      // Retry on rate limiting (429) with exponential backoff
      if (response.status === 429 && attempt < this.config.maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.warn(
          `Counterparty API rate limited, retrying in ${delay}ms (attempt ${attempt}/${this.config.maxRetries})`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callCounterpartyAPI(rpcRequest, attempt + 1);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // Retry on network errors (but not timeout/abort)
      if (attempt < this.config.maxRetries && error instanceof Error) {
        if (error.name === 'AbortError') {
          // Don't retry on timeout
          throw new Error(`Request timeout after ${this.config.timeout}ms`);
        }

        if (error.message.includes('fetch') || error.message.includes('network')) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.warn(
            `Counterparty API network error, retrying in ${delay}ms (attempt ${attempt}/${this.config.maxRetries}): ${error.message}`,
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.callCounterpartyAPI(rpcRequest, attempt + 1);
        }
      }

      throw error;
    }
  }

  /**
   * Validate CPID format
   *
   * Supports:
   * - A-prefixed numeric assets: A95428956662000000
   * - Alphabetic assets: MYTOKEN (max 13 characters)
   * - Sub-assets: A12345.SUBASSET
   *
   * @param value Asset name to validate
   * @returns boolean True if format is valid
   */
  private isValidCPID(value: string): boolean {
    if (!value || typeof value !== 'string') {
      return false;
    }

    // Normalize to uppercase
    const normalized = value.toUpperCase();

    // Check for sub-assets (contains dot)
    if (normalized.includes('.')) {
      const parts = normalized.split('.');
      if (parts.length !== 2) {
        return false; // Only one dot allowed
      }

      const [parentAsset, subAsset] = parts;

      // Ensure both parts exist
      if (!parentAsset || !subAsset) {
        return false;
      }

      // Parent must be valid A-prefixed numeric asset
      if (!/^A\d+$/.test(parentAsset)) {
        return false;
      }

      // Sub-asset must be valid alphabetic (1-13 chars, A-Z0-9)
      if (!/^[A-Z0-9]{1,13}$/.test(subAsset)) {
        return false;
      }

      return true;
    }

    // A-prefixed numeric assets
    if (/^A\d+$/.test(normalized)) {
      const numericPart = normalized.slice(1); // Remove 'A'

      // Must be valid number
      try {
        const assetId = BigInt(numericPart);

        // Must be positive
        if (assetId <= 0n) {
          return false;
        }

        // For validation purposes, we accept any valid A-prefixed numeric asset
        // The range checking is only used for generation, not validation
        return true;
      } catch {
        return false; // Invalid number
      }
    }

    // Alphabetic assets (1-13 characters, A-Z0-9, no leading A unless numeric)
    // Must start with B-Z to avoid confusion with A-prefixed numeric assets
    if (/^[B-Z][A-Z0-9]{0,12}$/.test(normalized)) {
      return true;
    }

    // Single letter alphabetic assets (B-Z only)
    if (/^[B-Z]$/.test(normalized)) {
      return true;
    }

    return false;
  }

  /**
   * Generate random BigInt in specified range
   *
   * @param min Minimum value (inclusive)
   * @param max Maximum value (exclusive)
   * @returns BigInt Random value in range
   */
  private generateRandomBigInt(min: bigint, max: bigint): bigint {
    if (min >= max) {
      throw new Error('Invalid range: min must be less than max');
    }

    const range = max - min;
    const byteLength = Math.ceil(range.toString(16).length / 2);

    let randomValue: bigint;

    // Generate random bytes until we get a value in range
    do {
      const randomBytes = new Uint8Array(byteLength);
      crypto.getRandomValues(randomBytes);

      // Convert to BigInt
      let hexString = '';
      for (const byte of randomBytes) {
        hexString += byte.toString(16).padStart(2, '0');
      }

      randomValue = BigInt('0x' + hexString);
    } while (randomValue >= range);

    return min + randomValue;
  }
}
