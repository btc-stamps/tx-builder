/**
 * Test Fixtures - Cryptographic Keys
 *
 * Valid public and private keys for testing Bitcoin scripts and transactions.
 * These are test keys only - never use in production!
 */

import { Buffer } from 'node:buffer';

/**
 * Valid compressed public keys for testing
 */
export const MOCK_PUBLIC_KEYS = {
  compressed: [
    '02b4632d08485ff1df2db55b9dafd23347d1c47a457072a1e87be26896549a8737',
    '03e15819590382a9dd878f01e2f0cbce541564eb415e43b440472d883ecd283058',
    '021f2f6e1e50cb6a953935c3601284925decd3fd21bc445712576873fb8c6ebc18',
    '03282b51c6ae1a5ca1375b4653c838e664f81fa02a314ed16f72e263d11633a9e9',
    '02c0d0c5fee952620757c6128dbf327c996cd72ed3358d15d6518a1186099bc15e',
    '0338994349b3a804c44bbec55c2824443ebb9e475dfdad14f4b1a01a97d42751b3',
    '03a81af7a5bdbcb6f03c9aea9b9d97db8f2f5e02e5d55033b9c12e1c9fc2e89db8',
    '02e7a9f881964d5caf735b2764e0419607b030a862af32b85d451d7f95038ebce5',
    '03b9b0ef92c0419e1dcecfc38e24a5437c976d3dce62c9a8e59d05e6247a14e6c3',
    '02859c2c130e6cc6de60290c23e92de7014f8f4f54fe0935b5a592291dfb6c4049',
    '02f7ba6dc72f97825aa82e65372e173ad9629a3238e8b30dc5e9f966a0cfb0c172',
    '039cfc4bd72709c705e5b3e4f2565b4836e59a5f48c1f37f59b1587e2e4789df6c',
    '021607076c1acb83e21e7619fe05ef37dc56e0485eaaae67dc8503a8f1714b63f3',
    '02ba7c70b86f38a76af5e387b75cd7f08f5e5a1e088e60d12fb8cc50bdd883b6a9',
    '036d51833dc19c6a9db9663ba0c3604c7b4bd3b3dd2e9dd837bedcd007dc7731e9',
  ],

  /**
   * Uncompressed version of the first compressed key
   */
  uncompressed:
    '04b4632d08485ff1df2db55b9dafd23347d1c47a457072a1e87be26896549a87378e54820c18c2fbc1e5c2106a7eb8e7668fa021407740a125b7689b8529c67602',
};

/**
 * Get public keys as buffers
 */
export function getPublicKeyBuffers(count = 2): Buffer[] {
  return MOCK_PUBLIC_KEYS.compressed
    .slice(0, count)
    .map((hex) => Buffer.from(hex, 'hex'));
}

/**
 * Get a single public key buffer
 */
export function getPublicKeyBuffer(index = 0): Buffer {
  return Buffer.from(MOCK_PUBLIC_KEYS.compressed[index], 'hex');
}

/**
 * Get uncompressed public key buffer
 */
export function getUncompressedPublicKeyBuffer(): Buffer {
  return Buffer.from(MOCK_PUBLIC_KEYS.uncompressed, 'hex');
}

/**
 * Test addresses for different networks
 */
export const MOCK_ADDRESSES = {
  testnet: {
    p2pkh: 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r',
    p2wpkh: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    p2sh: '2N3wh1eYqMeqoLxuKFv8PBsYR4f8gYn8dHm',
    p2wsh: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
  },
  mainnet: {
    p2pkh: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    p2wpkh: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    p2sh: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
    p2wsh: 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3',
  },
};

/**
 * Invalid test data for error cases
 */
export const MOCK_INVALID_DATA = {
  address: 'invalid-address',
  bech32: 'invalid-bech32',
  pubkey: Buffer.alloc(33, 0x00), // All zeros is not a valid pubkey
  // Create a truly malformed script that cannot be decompiled
  // Use an invalid opcode (0xff is undefined in Bitcoin Script)
  // Combined with truncated push data to ensure decompile fails
  malformedScript: Buffer.from([0x4b, 0xff, 0xff, 0xff]), // OP_PUSHDATA1 with length 255 but only 3 bytes follow
};
