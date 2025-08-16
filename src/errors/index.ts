/**
 * Custom Error Classes
 */

export class TransactionBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionBuilderError';
  }
}

export class InsufficientFundsError extends TransactionBuilderError {
  public required: number;
  public available: number;

  constructor(required: number, available: number) {
    super(`Insufficient funds: required ${required}, available ${available}`);
    this.name = 'InsufficientFundsError';
    this.required = required;
    this.available = available;
  }
}

export class InvalidAddressError extends TransactionBuilderError {
  public address: string;

  constructor(address: string) {
    super(`Invalid address: ${address}`);
    this.name = 'InvalidAddressError';
    this.address = address;
  }
}

export class InvalidTransactionError extends TransactionBuilderError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransactionError';
  }
}

export class ProviderError extends TransactionBuilderError {
  public provider?: string;

  constructor(message: string, provider?: string) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
  }
}

export class NetworkMismatchError extends TransactionBuilderError {
  public expected: string;
  public actual: string;

  constructor(expected: string, actual: string) {
    super(`Network mismatch: expected ${expected}, got ${actual}`);
    this.name = 'NetworkMismatchError';
    this.expected = expected;
    this.actual = actual;
  }
}

export class EncodingError extends TransactionBuilderError {
  constructor(message: string) {
    super(message);
    this.name = 'EncodingError';
  }
}

export class SelectionError extends TransactionBuilderError {
  constructor(message: string) {
    super(message);
    this.name = 'SelectionError';
  }
}

export class FeeEstimationError extends TransactionBuilderError {
  constructor(message: string) {
    super(message);
    this.name = 'FeeEstimationError';
  }
}
