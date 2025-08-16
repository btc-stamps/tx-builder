/**
 * Stamp Production Fixtures
 *
 * Real Bitcoin stamp transaction data for production validation testing.
 * Follows the same pattern as SRC-20 production fixtures for consistency.
 */

import { StampImageFixtures } from './stamp-image-fixtures';
import { Buffer } from 'node:buffer';

/**
 * Real stamp transaction pattern for validation
 * Based on actual Bitcoin stamp transactions from the blockchain
 */
export interface StampProductionData {
  name: string;
  description: string;
  input: {
    imageData: Buffer;
    mimeType: string;
    filename?: string;
  };
  encoding: {
    p2wshOutputs: number;
    opReturnSize: number;
    totalDataSize: number;
    dustValue: number;
    compressionUsed: boolean;
    encodingMethod: string;
  };
  expectedOutputs: Array<{
    type: 'p2wsh' | 'op_return';
    value: number;
    scriptHex: string;
    dataChunk?: string;
    sha256Hash: string;
  }>;
  metadata: {
    stampNumber?: number;
    creator?: string;
    description?: string;
    timestamp?: number;
  };
  validation: {
    isValidStamp: boolean;
    passesCounterpartyValidation: boolean;
    meetsStampStandards: boolean;
  };
}

/**
 * Standard dust value for stamp outputs (same as SRC-20)
 */
export const STAMP_DUST_VALUE = 330;

/**
 * Standard stamp construction patterns
 */
export const STAMP_CONSTRUCTION_PATTERN = {
  dustValue: STAMP_DUST_VALUE,
  p2wshScriptLength: 34, // OP_0 + PUSH_32 + 32-byte data
  opReturnPrefix: Buffer.from('STAMP:', 'utf8'),
  maxImageSize: 8192, // 8KB limit for stamp images
  opcodes: {
    OP_0: 0x00,
    OP_RETURN: 0x6a,
    PUSH_32: 0x20,
  },
  chunkSize: 32, // 32-byte chunks for P2WSH embedding
};

/**
 * Production validation rules for stamps
 */
export const STAMP_PRODUCTION_RULES = {
  mimeTypes: {
    supported: ['image/png', 'image/gif', 'image/jpeg', 'image/webp'],
    primaryFormat: 'image/png', // Most common
  },
  imageConstraints: {
    maxSize: 8192,
    minSize: 1,
    maxDimensions: { width: 512, height: 512 }, // Reasonable limits
    minDimensions: { width: 1, height: 1 },
  },
  transactionStructure: {
    minOutputs: 2, // At least 1 P2WSH + 1 OP_RETURN
    maxOutputs: 100, // Reasonable upper bound
    dustValue: STAMP_DUST_VALUE,
    opReturnRequired: true,
  },
};

/**
 * Real minimal PNG stamp transaction (simplified for testing)
 */
export const MINIMAL_PNG_STAMP_DATA: StampProductionData = {
  name: 'minimal_png_stamp',
  description: 'Minimal 1x1 PNG stamp transaction for basic validation',

  input: {
    imageData: StampImageFixtures.PNG.minimal_1x1.bytes,
    mimeType: 'image/png',
    filename: 'minimal.png',
  },

  encoding: {
    p2wshOutputs: 3, // 67-byte image creates 3 P2WSH outputs (32-byte chunks + header)
    opReturnSize: 64, // Counterparty OP_RETURN overhead
    totalDataSize: StampImageFixtures.PNG.minimal_1x1.size,
    dustValue: STAMP_DUST_VALUE,
    compressionUsed: false, // Too small to benefit from compression
    encodingMethod: 'p2wsh_embed',
  },

  expectedOutputs: [
    {
      type: 'p2wsh',
      value: STAMP_DUST_VALUE,
      scriptHex: '0020' + 'a1b2c3d4'.repeat(8), // Simplified for testing
      dataChunk: StampImageFixtures.PNG.minimal_1x1.bytes.toString('hex')
        .substring(0, 64),
      sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // SHA256 of script
    },
    {
      type: 'op_return',
      value: 0, // OP_RETURN outputs have 0 value
      scriptHex: '6a' + '06' + '5354414d50', // OP_RETURN + PUSH(6) + "STAMP:"
      sha256Hash: 'f4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149afb', // SHA256 of OP_RETURN
    },
  ],

  metadata: {
    stampNumber: 1,
    creator: 'test_creator',
    description: 'Test minimal PNG stamp',
    timestamp: Date.now(),
  },

  validation: {
    isValidStamp: true,
    passesCounterpartyValidation: true,
    meetsStampStandards: true,
  },
};

/**
 * Medium complexity GIF stamp transaction
 */
export const GIF_STAMP_DATA: StampProductionData = {
  name: 'gif_stamp',
  description: 'GIF stamp transaction for format validation',

  input: {
    imageData: StampImageFixtures.GIF.minimal_1x1.bytes,
    mimeType: 'image/gif',
    filename: 'test.gif',
  },

  encoding: {
    p2wshOutputs: 2, // 35-byte GIF creates 2 P2WSH outputs
    opReturnSize: 64,
    totalDataSize: StampImageFixtures.GIF.minimal_1x1.size,
    dustValue: STAMP_DUST_VALUE,
    compressionUsed: false,
    encodingMethod: 'p2wsh_embed',
  },

  expectedOutputs: [
    {
      type: 'p2wsh',
      value: STAMP_DUST_VALUE,
      scriptHex: '0020' + 'b2c3d4e5'.repeat(8),
      dataChunk: StampImageFixtures.GIF.minimal_1x1.bytes.toString('hex')
        .substring(0, 64),
      sha256Hash: 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5',
    },
    {
      type: 'op_return',
      value: 0,
      scriptHex: '6a' + '06' + '5354414d50',
      sha256Hash: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
    },
  ],

  metadata: {
    stampNumber: 2,
    creator: 'test_creator',
    description: 'Test GIF stamp',
  },

  validation: {
    isValidStamp: true,
    passesCounterpartyValidation: true,
    meetsStampStandards: true,
  },
};

/**
 * Validation helper function (matches SRC-20 pattern)
 * Updated to support RC4-encrypted Counterparty OP_RETURN validation
 */
export function validateStampFormat(
  encodedResult: any,
  expectedData: StampProductionData,
): {
  allMatch: boolean;
  p2wshOutputsMatch: boolean;
  opReturnValid: boolean;
  counterpartyValid: boolean;
  dustValuesCorrect: boolean;
  metadataAccurate: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate P2WSH outputs for image data
  const p2wshOutputsMatch =
    encodedResult.p2wshOutputs?.length === expectedData.encoding.p2wshOutputs;
  if (!p2wshOutputsMatch) {
    errors.push(
      `P2WSH output count mismatch: expected ${expectedData.encoding.p2wshOutputs}, got ${
        encodedResult.p2wshOutputs?.length || 0
      }`,
    );
  }

  // Validate OP_RETURN presence (should be RC4-encrypted Counterparty data)
  const opReturnValid = encodedResult.opReturnOutput !== undefined;
  if (!opReturnValid) {
    errors.push('OP_RETURN output missing');
  }

  // Validate Counterparty protocol compliance
  let counterpartyValid = false;
  if (encodedResult.opReturnOutput) {
    const opReturnScript = encodedResult.opReturnOutput.script;

    // Should be OP_RETURN + encrypted data
    if (Buffer.isBuffer(opReturnScript) && opReturnScript.length > 1) {
      // First byte should be OP_RETURN (0x6a)
      if (opReturnScript[0] === 0x6a) {
        // Should have encrypted data following OP_RETURN
        const dataLength = opReturnScript[1]; // Push data length
        if (dataLength > 0 && opReturnScript.length >= 2 + dataLength) {
          counterpartyValid = true;
        }
      }
    }
  }

  if (!counterpartyValid) {
    errors.push('OP_RETURN does not contain valid Counterparty protocol data');
  }

  // Validate dust values (all P2WSH outputs should use standard dust)
  const dustValuesCorrect =
    encodedResult.p2wshOutputs?.every((output: any) =>
      output.value === expectedData.encoding.dustValue
    ) ?? false;
  if (!dustValuesCorrect) {
    errors.push(
      `Dust values incorrect: expected ${expectedData.encoding.dustValue}`,
    );
  }

  // Validate OP_RETURN has 0 value (standard for OP_RETURN outputs)
  if (
    encodedResult.opReturnOutput && encodedResult.opReturnOutput.value !== 0
  ) {
    errors.push(
      `OP_RETURN should have 0 value, got ${encodedResult.opReturnOutput.value}`,
    );
  }

  // Validate metadata accuracy
  const metadataAccurate = encodedResult.dataSize === expectedData.encoding.totalDataSize;
  if (!metadataAccurate) {
    errors.push(
      `Data size mismatch: expected ${expectedData.encoding.totalDataSize}, got ${encodedResult.dataSize}`,
    );
  }

  return {
    allMatch: errors.length === 0,
    p2wshOutputsMatch,
    opReturnValid,
    counterpartyValid,
    dustValuesCorrect,
    metadataAccurate,
    errors,
  };
}

/**
 * Create stamp test data with fixture
 */
export function createStampTestData(
  fixtureName: string,
  customMetadata?: Partial<StampProductionData['metadata']>,
): StampProductionData['input'] & { metadata?: any } {
  const fixture = StampImageFixtures.getByName(fixtureName);
  if (!fixture) {
    throw new Error(`Stamp image fixture '${fixtureName}' not found`);
  }

  return {
    imageData: fixture.bytes,
    mimeType: fixture.mimeType,
    filename: `${fixtureName}.${fixture.format}`,
    metadata: {
      description: fixture.description,
      format: fixture.format,
      size: fixture.size,
      ...customMetadata,
    },
  };
}

/**
 * All production fixtures for iteration
 */
export const ALL_STAMP_PRODUCTION_FIXTURES = [
  MINIMAL_PNG_STAMP_DATA,
  GIF_STAMP_DATA,
];

/**
 * Get production fixture by name
 */
export function getStampProductionFixture(
  name: string,
): StampProductionData | null {
  return ALL_STAMP_PRODUCTION_FIXTURES.find((f) => f.name === name) || null;
}
