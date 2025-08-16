/**
 * Base Validation Type Definitions
 *
 * Core types for all validation operations
 */

/**
 * Generic validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Validation errors */
  errors: ValidationError[];
  /** Validation warnings */
  warnings: ValidationWarning[];
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Timestamp of validation */
  timestamp?: number;
  /** Validation duration in ms */
  duration?: number;
}

/**
 * Validation error details
 */
export interface ValidationError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Field or property that failed validation */
  field?: string;
  /** Severity level */
  severity: 'error' | 'critical';
  /** Additional context */
  context?: Record<string, any>;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  /** Warning code */
  code: string;
  /** Warning message */
  message: string;
  /** Field or property that triggered warning */
  field?: string;
  /** Severity level */
  severity: 'warning' | 'info';
  /** Suggested action */
  suggestion?: string;
  /** Additional context */
  context?: Record<string, any>;
}

/**
 * Validation context for passing state
 */
export interface ValidationContext {
  /** Current network */
  network?: string;
  /** Strict mode enabled */
  strictMode?: boolean;
  /** Skip certain validations */
  skipValidations?: string[];
  /** Custom validation rules */
  customRules?: ValidationRule[];
  /** Validation timeout in ms */
  timeout?: number;
}

/**
 * Custom validation rule
 */
export interface ValidationRule {
  /** Rule name */
  name: string;
  /** Rule description */
  description?: string;
  /** Validation function */
  validate: (
    value: any,
    context?: ValidationContext,
  ) => boolean | ValidationResult;
  /** Error message if validation fails */
  errorMessage?: string;
  /** Whether this rule is required */
  required?: boolean;
}

/**
 * Batch validation result
 */
export interface BatchValidationResult {
  /** Overall validation status */
  isValid: boolean;
  /** Individual validation results */
  results: Map<string, ValidationResult>;
  /** Total items validated */
  totalItems: number;
  /** Items that passed validation */
  passedItems: number;
  /** Items that failed validation */
  failedItems: number;
  /** Aggregated errors */
  allErrors: ValidationError[];
  /** Aggregated warnings */
  allWarnings: ValidationWarning[];
}
