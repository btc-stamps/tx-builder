export const MOCK_UTXOS = [
  {
    txid: 'abc123',
    vout: 0,
    value: 100000,
    scriptPubKey: '76a914...',
    height: 800000,
    address: 'bc1qtest1',
  },
  {
    txid: 'def456',
    vout: 1,
    value: 50000,
    scriptPubKey: '76a914...',
    height: 800001,
    address: 'bc1qtest2',
  },
  {
    txid: 'ghi789',
    vout: 2,
    value: 25000,
    scriptPubKey: '76a914...',
    height: 800002,
    address: 'bc1qtest3',
  },
];

export const createMockUtxoSet = (baseValue = 100000, count = 3) =>
  Array.from({ length: count }, (_, i) => ({
    txid: `mock_txid_${i}`,
    vout: i,
    value: baseValue * (i + 1),
    scriptPubKey: '76a914...',
    height: 800000 + i,
    address: `bc1qtest${i + 4}`,
  }));

export const createLargeUtxoSet = (baseValue = 100000, count = 10) =>
  Array.from({ length: count }, (_, i) => ({
    txid: `large_mock_txid_${i}`,
    vout: i,
    value: baseValue * (Math.pow(2, i)), // Exponential growth
    scriptPubKey: '76a914...',
    height: 800000 + i,
    address: `bc1qtest_large_${i + 1}`,
  }));

export const createOrdinalUtxoSet = (baseValue = 10000, count = 3) =>
  Array.from({ length: count }, (_, i) => ({
    txid: `ordinal_mock_txid_${i}`,
    vout: i,
    value: baseValue * (i + 1),
    scriptPubKey: '76a914...',
    height: 800000 + i,
    address: `bc1qordinal_${i + 1}`,
    ordinalContent: {
      type: i % 2 === 0 ? 'image' : 'text',
      data: `Ordinal content ${i}`,
    },
  }));
