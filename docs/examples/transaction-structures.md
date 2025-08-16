# Bitcoin Transaction Structures for Stamps and SRC-20

This document shows the actual Bitcoin transaction structures for both Bitcoin
Stamps and SRC-20 tokens.

## 1. Bitcoin Stamps Transaction Structure

A Bitcoin Stamp transaction embeds image data directly on-chain using P2WSH
P2WSH encoding:

### Transaction Components:

```javascript
{
  // INPUTS
  inputs: [
    {
      txid: "previous_transaction_hash",
      vout: 0,
      value: 100000,  // Source UTXO with funds
    }
  ],
  
  // OUTPUTS
  outputs: [
    // Output 1: Counterparty OP_RETURN with STAMP:filename reference
    {
      script: "OP_RETURN 434e545250525459001e5354414d503a696d6167652e706e67",
      value: 0,
      // Decoded structure:
      // - 434e545250525459: "CNTRPRTY" (8-byte prefix)
      // - 1e: MESSAGE_TYPE_BROADCAST (30 decimal)
      // - 5354414d503a...: "STAMP:filename" (not base64 data)
      // This properly follows Counterparty protocol encoding
    },
    
    // Output 2-N: P2WSH outputs containing raw binary image data chunks
    {
      script: "OP_0 <32-byte-witness-script-hash>",
      value: 546,  // Dust limit for P2WSH
      witnessScript: "OP_FALSE OP_IF <519-bytes-image-chunk-1> OP_ENDIF",
      // This embeds first 519 bytes of raw image binary
    },
    {
      script: "OP_0 <32-byte-witness-script-hash>",
      value: 546,  // Dust limit
      witnessScript: "OP_FALSE OP_IF <519-bytes-image-chunk-2> OP_ENDIF",
      // Second chunk if image > 519 bytes
    },
    // ... more chunks as needed for larger images
    
    // Final Output: Change back to sender
    {
      script: "OP_DUP OP_HASH160 <pubkey-hash> OP_EQUALVERIFY OP_CHECKSIG",
      value: 95000,  // Remaining after fee
    }
  ]
}
```

### Example Test Transaction (24x24 PNG, ~1KB):

```javascript
// Test transaction for a small stamp
const stampTx = {
  version: 2,
  locktime: 0,

  inputs: [{
    txid: 'abcd1234...',
    vout: 0,
    scriptSig: '', // Empty for witness transactions
    witness: ['<signature>', '<pubkey>'],
    sequence: 0xfffffffe,
  }],

  outputs: [
    // Counterparty protocol identifier
    {
      value: 0,
      scriptPubKey: '6a' + // OP_RETURN
        '434e545250525459' + // "CNTRPRTY" (8-byte prefix)
        '1e' + // MESSAGE_TYPE_BROADCAST (30)
        '5354414d503a696d6167652e706e67', // "STAMP:image.png" (filename only)
    },

    // P2WSH with image data (2 chunks for 1KB image)
    {
      value: 546,
      scriptPubKey: '0020' + sha256(witnessScript1), // P2WSH
      witnessScript: '0063' + '02070182...', // OP_FALSE OP_IF <519 bytes> OP_ENDIF
    },
    {
      value: 546,
      scriptPubKey: '0020' + sha256(witnessScript2),
      witnessScript: '0063' + '02070182...', // Remaining bytes
    },

    // Change
    {
      value: 98362,
      scriptPubKey: '76a914' + pubkeyHash + '88ac', // P2PKH
    },
  ],
  // Transaction size: ~1,200 bytes
  // Fee: ~1,638 sats at 1.5 sat/vB
};
```

## 2. SRC-20 Token Transaction Structure

SRC-20 transactions use P2WSH P2WSH to embed JSON token data:

### Transfer Transaction:

```javascript
{
  // INPUTS
  inputs: [
    {
      txid: "funding_utxo",
      vout: 1,
      value: 50000,  // Additional funds for fee
    }
  ],
  
  // OUTPUTS
  outputs: [
    // Output 1: P2WSH with SRC-20 transfer data
    {
      script: "OP_0 <32-byte-witness-script-hash>",
      value: 330,
      witnessScript: "OP_FALSE OP_IF <src20-json-data> OP_ENDIF",
      // JSON data example:
      // {"p":"src-20","op":"transfer","tick":"STAMP","amt":"1000","to":"1A1zP1..."}
    },
    
    // Output 2: Recipient stamp UTXO (preserves stamp status)
    {
      script: "OP_DUP OP_HASH160 <recipient-pubkey-hash> OP_EQUALVERIFY OP_CHECKSIG",
      value: 330,  
    },
    
    // Output 3: Change
    {
      script: "OP_DUP OP_HASH160 <sender-pubkey-hash> OP_EQUALVERIFY OP_CHECKSIG",
      value: 45000,  // Remaining after fees
    }
  ]
}
```

### Mint/Deploy Transaction:

```javascript
const src20MintTx = {
  version: 2,
  locktime: 0,

  inputs: [{
    txid: 'def456...',
    vout: 0,
    scriptSig: '',
    witness: ['<signature>', '<pubkey>'],
    sequence: 0xfffffffe,
  }],

  outputs: [
    // SRC-20 mint operation embedded in P2WSH
    {
      value: 546,
      scriptPubKey: '0020' + sha256(witnessScript),
      witnessScript: '0063' + Buffer.from(JSON.stringify({
        p: 'src-20',
        op: 'mint',
        tick: 'KEVIN',
        amt: '1000000',
      })).toString('hex') + '68', // OP_FALSE OP_IF <data> OP_ENDIF
    },

    // Stamp UTXO to hold minted tokens
    {
      value: 500000, // Minimum stamp value
      scriptPubKey: '76a914' + minterPubkeyHash + '88ac',
    },

    // Change
    {
      value: 49454,
      scriptPubKey: '76a914' + minterPubkeyHash + '88ac',
    },
  ],
  // Transaction size: ~400 bytes
  // Fee: ~600 sats at 1.5 sat/vB
};
```

## 3. Key Differences

### Bitcoin Stamps:

- **Data Type**: Raw binary image data (PNG, GIF, etc.)
- **Encoding**: Multiple P2WSH outputs for chunked binary data
- **Identifier**: Counterparty OP_RETURN with base64 URI
- **Size**: Typically 1-8KB (multiple outputs needed)
- **Dust Outputs**: Multiple 546 sat outputs for data chunks

### SRC-20 Tokens:

- **Data Type**: JSON text data
- **Encoding**: Single P2WSH output with JSON
- **Identifier**: JSON includes `"p":"src-20"` protocol marker
- **Size**: Typically <500 bytes (single output)
- **Stamp UTXO**: Requires 500,000 sat minimum value UTXO

## 4. P2WSH P2WSH Structure Explained

The witness script structure used in both:

```
OP_FALSE OP_IF <data> OP_ENDIF
```

- **OP_FALSE (0x00)**: Pushes false to stack
- **OP_IF (0x63)**: Conditional that's never executed (since stack has false)
- **<data>**: Arbitrary data (max 519 bytes per chunk due to script limits)
- **OP_ENDIF (0x68)**: Ends the conditional

This creates an unspendable output that permanently stores data on-chain while
being prunable from the UTXO set (since it's provably unspendable).

## 5. Transaction Size and Fee Calculations

### Stamp Transaction (1KB image):

- Base transaction: ~200 bytes
- OP_RETURN output: ~80 bytes
- P2WSH outputs (2): ~2 × 550 bytes = 1,100 bytes
- Total: ~1,380 bytes (345 vBytes with witness discount)
- Fee at 1.5 sat/vB: ~518 sats

### SRC-20 Transfer:

- Base transaction: ~200 bytes
- P2WSH output: ~150 bytes
- Recipient output: ~34 bytes
- Change output: ~34 bytes
- Total: ~418 bytes (280 vBytes with witness)
- Fee at 1.5 sat/vB: ~420 sats

## 6. Practical Examples with Real Addresses

### Example Bitcoin Addresses for Testing:

```javascript
// Mainnet addresses (for documentation examples)
const addresses = {
  sender: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', // P2WPKH Bech32
  recipient: 'bc1qyzhysehfk89lfwgqgdjyz9g0a7azswf8y5yfs0', // P2WPKH Bech32
  change: 'bc1qn0sq7dwskh7pv5a2xh7z6fvqyvpk0z9x7cxmrr', // P2WPKH Change
  legacy: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // P2PKH Legacy
};

// Testnet addresses (for actual testing)
const testnetAddresses = {
  sender: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxw508d', // Testnet P2WPKH
  recipient: 'tb1qyzhysehfk89lfwgqgdjyz9g0a7azswf8qrjfhd', // Testnet P2WPKH
  change: 'tb1qn0sq7dwskh7pv5a2xh7z6fvqyvpk0z9x7qfvjtn', // Testnet Change
};
```

### Real Transaction Example (Testnet):

```javascript
// Real stamp transaction structure
const stampTransaction = {
  from: testnetAddresses.sender,
  to: testnetAddresses.recipient,
  changeAddress: testnetAddresses.change,
  imageFile: 'my-stamp.png',
  cpid: 'A95428956662000000', // From stampchain.io
  fee: 1000, // sats
};

// Real SRC-20 transfer structure
const src20Transaction = {
  from: testnetAddresses.sender,
  to: testnetAddresses.recipient,
  changeAddress: testnetAddresses.change,
  tick: 'TEST',
  amount: '1000',
  fee: 500, // sats
};
```

## 7. Testing These Structures

To test these transaction structures on testnet:

```javascript
import { TransactionBuilder } from '@btc-stamps/tx-builder';

// Create a stamp transaction
const stampTx = await builder
  .addStamp({
    imageData: fs.readFileSync('stamp.png'),
    metadata: { title: 'Test Stamp' },
  })
  .addInput(utxo)
  .calculateFee()
  .build();

// Create an SRC-20 transfer
const src20Tx = await builder
  .addSRC20Transfer({
    tick: 'KEVIN',
    amount: '1000',
    recipient: 'tb1q...',
  })
  .addInput(stampUtxo)
  .calculateFee()
  .build();
```

Both transaction types use the same P2WSH P2WSH encoding mechanism but for
different data types and purposes.
