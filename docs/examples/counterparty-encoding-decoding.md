# Counterparty Protocol Encoding/Decoding Documentation

## Overview

This document provides a comprehensive reference for Counterparty protocol message encoding and decoding, specifically for Bitcoin Stamps issuance transactions. It serves as the source of truth for understanding the different encoding formats and ensuring compatibility with the Counterparty API.

## Table of Contents

1. [Message Types](#message-types)
2. [Encoding Formats](#encoding-formats)
3. [Field Specifications](#field-specifications)
4. [Variable-Length Encoding](#variable-length-encoding)
5. [Decoding Logic](#decoding-logic)
6. [Implementation Requirements](#implementation-requirements)
7. [Future Support](#future-support)

## Message Types

### Standard Issuance Types

| Type ID | Name        | Description             | Usage                                           |
| ------- | ----------- | ----------------------- | ----------------------------------------------- |
| 20      | ISSUANCE    | Standard asset issuance | Legacy protocol                                 |
| 21      | SUBASSET    | Subasset issuance       | For subassets (e.g., A12345.SUB)                |
| 22      | LR_ISSUANCE | Lock/Reset issuance     | Default with `issuance_backwards_compatibility` |
| 23      | LR_SUBASSET | Lock/Reset subasset     | Subasset with LR support                        |

**Current Standard**: Type 22 (LR_ISSUANCE) is the default for new issuances on mainnet.

## Encoding Formats

### Format 1: Compact Format (31 bytes typical)

Used by stampchain.io and modern Counterparty implementations.

```
Structure:
┌────────┬──────────┬──────────┬───────┬─────────────┐
│ Type   │ Asset ID │ Quantity │ Flags │ Description │
│ 1 byte │ 8 bytes  │ 8 bytes  │ 1 byte│ Variable    │
└────────┴──────────┴──────────┴───────┴─────────────┘

Byte Layout:
[0]      Message Type (22 for LR_ISSUANCE)
[1-8]    Asset ID (64-bit big-endian)
[9-16]   Quantity (64-bit big-endian)
[17]     Flags byte:
         - Bit 0: divisible (1 = divisible, 0 = indivisible)
         - Bit 1: lock (1 = locked, 0 = unlocked)
         - Bit 2: reset (1 = reset, 0 = no reset)
[18+]    Description (UTF-8 string, null-padded)
```

### Format 2: Extended Format (50 bytes typical)

Legacy format that includes deprecated callable fields.

```
Structure:
┌────────┬──────────┬──────────┬───────────┬──────┬───────┬───────────┬──────────┬─────────┬─────────────┐
│ Type   │ Asset ID │ Quantity │ Divisible │ Lock │ Reset │ Call Date │Call Price│Desc Len │ Description │
│ 1 byte │ 8 bytes  │ 8 bytes  │ 1 byte    │1 byte│1 byte │ 4 bytes   │ 4 bytes  │ 1 byte  │ Variable    │
└────────┴──────────┴──────────┴───────────┴──────┴───────┴───────────┴──────────┴─────────┴─────────────┘

Byte Layout:
[0]      Message Type (22 for LR_ISSUANCE)
[1-8]    Asset ID (64-bit big-endian)
[9-16]   Quantity (64-bit big-endian)
[17]     Divisible (0 or 1)
[18]     Lock (0 or 1)
[19]     Reset (0 or 1)
[20-23]  Call Date (deprecated, set to 0)
[24-27]  Call Price (deprecated, set to 0.0)
[28]     Description Length (Pascal string length byte)
[29+]    Description (UTF-8 string)
```

### Format 3: CBOR Format (Future)

When `taproot_support` protocol flag is enabled.

```
Structure:
[Type byte] + CBOR([asset_id, quantity, divisible, lock, reset, mime_type, description])
```

## Field Specifications

### Asset ID

- **Type**: 64-bit unsigned integer (big-endian)
- **Valid Range**:
  - Numeric assets: 95,428,956,661,682,177 to 18,446,744,073,709,551,615
  - Calculated as: 26^12 + 1 to 2^64 - 1
- **Encoding**: Always 8 bytes, big-endian

### Quantity

- **Type**: 64-bit unsigned integer (big-endian)
- **Valid Range**: 0 to 2^64 - 1
- **Special Values**:
  - 0: Used for transfers or lock operations
  - For divisible assets: Actual quantity × 10^8 (satoshi representation)

### Flags

In compact format, flags are combined into a single byte:

```javascript
flagsByte = (divisible ? 0x01 : 0) | (lock ? 0x02 : 0) | (reset ? 0x04 : 0);
```

### Description

- **Encoding**: UTF-8
- **Max Length**:
  - Standard OP_RETURN: 52 bytes (80 total - 28 for headers/fields)
  - With multisig encoding: Can be longer
- **Special Cases**:
  - Empty description: Omitted or null-padded
  - Binary data: Requires mime_type specification (future support)

## Variable-Length Encoding

### Standard Practice

The Counterparty protocol supports variable-length encoding for efficiency:

1. **Quantity**: Always 8 bytes for consistency
2. **Description**: Variable length, terminated by:
   - End of message
   - Null padding
   - Pascal string length byte (legacy)

### Recommended Implementation

```python
# Encoding (Python-like pseudocode)
def encode_issuance(asset_id, quantity, divisible, lock, description):
    message = bytearray()
    message.append(22)  # LR_ISSUANCE type
    message.extend(asset_id.to_bytes(8, 'big'))
    message.extend(quantity.to_bytes(8, 'big'))
    
    # Combine flags into single byte
    flags = (1 if divisible else 0) | (2 if lock else 0)
    message.append(flags)
    
    # Add description if present
    if description:
        message.extend(description.encode('utf-8'))
    
    return bytes(message)
```

## Decoding Logic

### Universal Decoder Implementation

```typescript
function decodeCounterpartyMessage(buffer: Buffer): DecodedMessage {
  const messageType = buffer[0];

  if (messageType !== 20 && messageType !== 22) {
    throw new Error(`Unsupported message type: ${messageType}`);
  }

  const assetId = buffer.readBigUInt64BE(1);
  const quantity = buffer.readBigUInt64BE(9);

  let divisible, lock, description;

  // Detect format based on length and structure
  if (buffer.length <= 31 || buffer[17] <= 1) {
    // Compact format
    const flags = buffer[17];
    divisible = (flags & 0x01) !== 0;
    lock = (flags & 0x02) !== 0;

    // Description starts at byte 18
    const descBytes = buffer.slice(18);
    description = descBytes.toString('utf8').replace(/\0+$/, '');
  } else {
    // Extended format
    divisible = buffer[17] !== 0;
    lock = buffer[18] !== 0;

    // Skip deprecated fields [19-27]
    // Description length at [28], content at [29+]
    if (buffer.length > 28) {
      const descLength = buffer[28];
      if (descLength > 0 && 29 + descLength <= buffer.length) {
        description = buffer.slice(29, 29 + descLength).toString('utf8');
      }
    }
  }

  return {
    messageType,
    assetId,
    quantity,
    divisible,
    lock,
    description: description || '',
  };
}
```

## Implementation Requirements

### TX-Builder Compliance

The tx-builder MUST produce output that exactly matches the Counterparty API for:

1. **Message Type**: Use type 22 (LR_ISSUANCE) by default
2. **Field Order**: Maintain exact byte order as specified
3. **Encoding Format**: Use compact format (31-byte) excluding deprecated fields
4. **Flag Handling**: Combine divisible/lock/reset into single flags byte
5. **Description**: UTF-8 encode, no null termination unless padding required

### Validation Requirements

```typescript
// Test vectors for validation
const testCases = [
  {
    input: {
      assetId: 'A95428956661682177',
      quantity: 1,
      divisible: false,
      lock: false,
      description: '',
    },
    expectedHex: '16015297df555c5a010000000000000000000100',
  },
  {
    input: {
      assetId: 'A95428956661682177',
      quantity: 1000,
      divisible: false,
      lock: true,
      description: 'Test',
    },
    expectedHex: '16015297df555c5a0100000000000003e80254657374',
  },
];
```

### Excluded Fields

The following deprecated fields should NOT be included in new implementations:

- **Call Date**: 4 bytes (formerly for callable assets)
- **Call Price**: 4 bytes (formerly for callable assets)
- **Callable flag**: Replaced by lock/reset mechanism

These fields are only present in legacy extended format for backward compatibility.

## Future Support

### Taproot/CBOR Encoding

When the `taproot_support` protocol flag becomes active:

1. **Format**: CBOR (Concise Binary Object Representation)
2. **Structure**: Array of [asset_id, quantity, divisible, lock, reset, mime_type, description]
3. **Benefits**:
   - More efficient encoding
   - Support for binary descriptions
   - Extensible for future fields

### Implementation Roadmap

```typescript
// Future CBOR support interface
interface CBORIssuanceData {
  assetId: bigint;
  quantity: bigint;
  divisible: boolean;
  lock: boolean;
  reset: boolean;
  // Note: mimeType not included - Bitcoin Stamps detect format from binary data
  description: string | Buffer;
}

// Encoding would use cbor2 library
function encodeCBOR(data: CBORIssuanceData): Buffer {
  // Implementation pending protocol activation
  throw new Error('CBOR encoding not yet supported');
}
```

### Migration Path

1. **Current**: Use compact format (type 22, 31-byte typical)
2. **Transition**: Support both compact and CBOR formats in decoder
3. **Future**: Switch to CBOR as default when protocol activates

## Testing and Validation

### Critical Test Parameters

Test the encoder/decoder with these variations:

1. **Quantities**:
   - Minimum: 1
   - Standard: 1000, 10000
   - Maximum: 2^32 - 1 (4,294,967,295)
   - Edge: 2^64 - 1 (for future compatibility)

2. **Asset IDs**:
   - Minimum valid: A95428956661682177
   - Maximum valid: A18446744073709551615

3. **Descriptions**:
   - Empty: ""
   - Short: "A"
   - Medium: "Test Asset"
   - Maximum: 52 characters for standard OP_RETURN

4. **Flag Combinations**:
   - All false: divisible=false, lock=false
   - All true: divisible=true, lock=true
   - Mixed: Various combinations

### Validation Script

See `scripts/validate-counterparty-encoding.ts` for comprehensive testing.

## References

- [Counterparty Core Source](https://github.com/CounterpartyXCP/counterparty-core)
- [CIP-3: Reset and Lock Issuances](https://github.com/CounterpartyXCP/cips/blob/master/cip-0003.md)
- [Counterparty API Documentation](https://counterpartycore.docs.apiary.io/)

## Version History

- **v1.0.0** (2024): Initial documentation
- Supports Counterparty Core v10.x encoding
- Type 22 (LR_ISSUANCE) as default
- Compact format without deprecated fields
