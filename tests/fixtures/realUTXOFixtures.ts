// Real Bitcoin UTXO Test Fixtures from Mempool.space
// Migrated from BTCStampsExplorer for tx-builder testing
// These are real UTXOs from the Bitcoin blockchain

interface UTXOFixture {
  txid: string;
  vout: number;
  value: number;
  script: string;
  address: string;
  scriptType: 'p2wpkh' | 'p2pkh' | 'p2tr';
}

export const realUTXOFixtures: {
  p2wpkh: Record<string, UTXOFixture>;
  p2pkh: Record<string, UTXOFixture>;
  p2tr: Record<string, UTXOFixture>;
} = {
  'p2wpkh': {
    'real_811_c9933a04': {
      'txid': 'c9933a04e0b30524e3ff3c56ca9171ed61a74ecc476181835777cf03b841645d',
      'vout': 1,
      'value': 811,
      'script': '0014e8df018c7e326cc253faac7e46cdc51e68542c42',
      'address': 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      'scriptType': 'p2wpkh',
    },
    'real_1000_b89dcfce': {
      'txid': 'b89dcfce2cd7929ccdf4fc597e551b6bf43441571dc09e465d09ab0a854ac997',
      'vout': 0,
      'value': 1000,
      'script': '0014e8df018c7e326cc253faac7e46cdc51e68542c42',
      'address': 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      'scriptType': 'p2wpkh',
    },
  },
  'p2pkh': {
    'real_1000_5e9883eb': {
      'txid': '5e9883eb4e100d56ee470f817e1421802cac82419b049adc69d3bbebbc1e1dfd',
      'vout': 0,
      'value': 1000,
      'script': '76a91477bff20c60e522dfaa3350c39b030a5d004e839a88ac',
      'address': '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      'scriptType': 'p2pkh',
    },
    'real_4700_d94ed52d': {
      'txid': 'd94ed52d0cdb8af5e1fd85b1c60337e393289b612f537c1ea00ba4050b141916',
      'vout': 0,
      'value': 4700,
      'script': '76a914e8cea30989bd15530f819b766684b00dc7ba7cfa88ac',
      'address': '1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s',
      'scriptType': 'p2pkh',
    },
    'real_5000_e9e3950b': {
      'txid': 'e9e3950bc2a1a8c8fa5b63c7b99d5302c5c1ef7163e57872bdbdd7a240993b72',
      'vout': 10,
      'value': 5000,
      'script': '76a914e8cea30989bd15530f819b766684b00dc7ba7cfa88ac',
      'address': '1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s',
      'scriptType': 'p2pkh',
    },
  },
  'p2tr': {
    'real_7920_5df5adce': {
      'txid': '5df5adce7c6a0e2ac8af65d7a226fccac7896449c09570a214dcaf5b8c43f85e',
      'vout': 0,
      'value': 7920,
      'script': '5120a37c3903c8d0db6512e2b40b0dffa05e5a3ab73603ce8c9c4b7771e5412328f9',
      'address': 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297',
      'scriptType': 'p2tr',
    },
    'real_67230_33e794d0': {
      'txid': '33e794d097969002ee05d336686fc03c9e15a597c1b9827669460fac98799036',
      'vout': 1,
      'value': 67230,
      'script': '5120a37c3903c8d0db6512e2b40b0dffa05e5a3ab73603ce8c9c4b7771e5412328f9',
      'address': 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297',
      'scriptType': 'p2tr',
    },
  },
};

// Helper function to get all fixtures as array
export function getAllRealUTXOFixtures() {
  const allFixtures: any[] = [];

  Object.values(realUTXOFixtures).forEach((scriptTypeGroup) => {
    Object.values(scriptTypeGroup).forEach((fixture) => {
      allFixtures.push(fixture);
    });
  });

  return allFixtures;
}

// Helper function to get high-value UTXOs for transaction testing
export function getHighValueUTXOs(minValue = 5000) {
  return getAllRealUTXOFixtures().filter((utxo) => utxo.value >= minValue);
}

// Helper function to get specific UTXO types
export function getUTXOsByType(scriptType: string) {
  const fixtures = realUTXOFixtures[scriptType as keyof typeof realUTXOFixtures];
  if (!fixtures) return [];
  return Object.values(fixtures);
}
