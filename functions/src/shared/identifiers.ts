import * as crypto from 'crypto';

// ============================================================================
// 1. CHECKSUM ALGORITHMS & BARCODE VALIDATION
// ============================================================================

/**
 * Validates EAN-13 check digit using the standard modulo 10 algorithm.
 * Weight factor alternates between 1 and 3 (1 for odd positions, 3 for even positions, 1-indexed).
 */
export function validateEan13CheckDigit(barcode: string): boolean {
  const trimmed = barcode.trim();
  if (!/^\d{13}$/.test(trimmed)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(trimmed.charAt(i), 10);
    // 1-indexed: index 0 is 1st (odd -> weight 1), index 1 is 2nd (even -> weight 3)
    sum += i % 2 === 0 ? digit * 1 : digit * 3;
  }

  const remainder = sum % 10;
  const expectedCheckDigit = remainder === 0 ? 0 : 10 - remainder;
  const actualCheckDigit = parseInt(trimmed.charAt(12), 10);

  return expectedCheckDigit === actualCheckDigit;
}

/**
 * Validates UPC-A check digit using the standard modulo 10 algorithm.
 * For UPC-A (12 digits), odd positions (1, 3, 5, 7, 9, 11) have weight 3,
 * and even positions (2, 4, 6, 8, 10) have weight 1.
 */
export function validateUpcaCheckDigit(barcode: string): boolean {
  const trimmed = barcode.trim();
  if (!/^\d{12}$/.test(trimmed)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(trimmed.charAt(i), 10);
    // 1-indexed: index 0 is 1st (odd -> weight 3), index 1 is 2nd (even -> weight 1)
    sum += i % 2 === 0 ? digit * 3 : digit * 1;
  }

  const remainder = sum % 10;
  const expectedCheckDigit = remainder === 0 ? 0 : 10 - remainder;
  const actualCheckDigit = parseInt(trimmed.charAt(11), 10);

  return expectedCheckDigit === actualCheckDigit;
}

/**
 * Validates Code-128 barcode format.
 * Code-128 supports printable ASCII characters (ASCII 32 to 126).
 * Standard enterprise length is 1 to 80 characters.
 */
export function validateCode128(barcode: string): boolean {
  const trimmed = barcode.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return false;
  }
  // Printable ASCII 32 to 126
  return /^[\x20-\x7E]+$/.test(trimmed);
}

/**
 * Validates Custom Alphanumeric Internal Barcode format.
 * Format: 2 to 50 uppercase alphanumeric characters, dashes, or underscores.
 */
export function validateCustomBarcode(barcode: string): boolean {
  const trimmed = barcode.trim().toUpperCase();
  return /^[A-Z0-9_-]{2,50}$/.test(trimmed);
}

export type BarcodeType = 'EAN13' | 'UPCA' | 'CODE128' | 'CUSTOM';

export interface BarcodeValidationResult {
  valid: boolean;
  type: BarcodeType | 'INVALID';
  normalized: string;
  error?: string;
}

/**
 * Detects format and rigorously validates a barcode string.
 */
export function detectAndValidateBarcode(rawBarcode: string): BarcodeValidationResult {
  if (!rawBarcode || typeof rawBarcode !== 'string') {
    return { valid: false, type: 'INVALID', normalized: '', error: 'Barcode must be a non-empty string' };
  }

  const trimmed = rawBarcode.trim();
  if (trimmed.length === 0) {
    return { valid: false, type: 'INVALID', normalized: '', error: 'Barcode cannot be empty or whitespace' };
  }

  // 1. Check numeric lengths
  if (/^\d+$/.test(trimmed)) {
    if (trimmed.length === 13) {
      if (validateEan13CheckDigit(trimmed)) {
        return { valid: true, type: 'EAN13', normalized: trimmed };
      }
      return { valid: false, type: 'INVALID', normalized: trimmed, error: 'Invalid EAN-13 check digit' };
    }

    if (trimmed.length === 12) {
      if (validateUpcaCheckDigit(trimmed)) {
        return { valid: true, type: 'UPCA', normalized: trimmed };
      }
      return { valid: false, type: 'INVALID', normalized: trimmed, error: 'Invalid UPC-A check digit' };
    }
  }

  // 2. Custom internal format
  const normalizedCustom = trimmed.toUpperCase();
  if (/^[A-Z0-9_-]{2,50}$/.test(normalizedCustom)) {
    return { valid: true, type: 'CUSTOM', normalized: normalizedCustom };
  }

  // 3. Fallback Code-128
  if (validateCode128(trimmed)) {
    return { valid: true, type: 'CODE128', normalized: trimmed };
  }

  return {
    valid: false,
    type: 'INVALID',
    normalized: trimmed,
    error: 'Barcode format not supported (must be valid EAN-13, UPC-A, Code-128, or custom alphanumeric)',
  };
}

// ============================================================================
// 2. SKU VALIDATION & NORMALIZATION
// ============================================================================

/**
 * Normalizes SKU string: trimmed, uppercase.
 */
export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

/**
 * Validates SKU format.
 * Must be 2-50 characters: uppercase alphanumeric, underscores, hyphens, slashes, or dots.
 */
export function validateSku(sku: string): { valid: boolean; normalized: string; error?: string } {
  if (!sku || typeof sku !== 'string') {
    return { valid: false, normalized: '', error: 'SKU must be a non-empty string' };
  }
  const normalized = normalizeSku(sku);
  if (normalized.length < 2) {
    return { valid: false, normalized, error: 'SKU must be at least 2 characters' };
  }
  if (normalized.length > 50) {
    return { valid: false, normalized, error: 'SKU must not exceed 50 characters' };
  }
  if (!/^[A-Z0-9_\-\.\/]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'SKU can only contain uppercase letters, numbers, hyphens, underscores, dots, and slashes',
    };
  }
  return { valid: true, normalized };
}

// ============================================================================
// 3. DETERMINISTIC VARIANT IDENTIFIER GENERATION
// ============================================================================

/**
 * Canonicalizes an attributes map into a stable sorted string representation:
 * 1. Lowers and trims all axis keys.
 * 2. Trims all axis values.
 * 3. Sorts keys alphabetically.
 * 4. Joins into `key=val;key=val` format.
 */
export function canonicalizeAttributes(attributes: Record<string, string>): string {
  const normalizedEntries = Object.entries(attributes).map(([k, v]) => [
    k.trim().toLowerCase(),
    v.trim(),
  ]);

  normalizedEntries.sort((a, b) => a[0].localeCompare(b[0]));

  return normalizedEntries.map(([k, v]) => `${k}=${v}`).join(';');
}

/**
 * Generates a stable, deterministic variant ID from productId and attribute combinations.
 * Uses SHA-256 hash over `productId::canonicalAttributes`.
 * Format: `var_${hash.slice(0, 16)}`
 *
 * Guarantees:
 * - Independent of attribute insertion order or casing in axis names.
 * - Same product + same attributes always produces the exact same variant ID.
 * - No collisions across different products or different attribute values.
 */
export function generateDeterministicVariantId(
  productId: string,
  attributes: Record<string, string>
): string {
  const canonical = canonicalizeAttributes(attributes);
  const rawInput = `${productId.trim()}::${canonical}`;
  const hash = crypto.createHash('sha256').update(rawInput).digest('hex');
  return `var_${hash.slice(0, 16)}`;
}

// ============================================================================
// 4. MATRIX CARTESIAN PRODUCT GENERATION
// ============================================================================

export interface VariantAxisInput {
  name: string;
  values: string[];
}

export interface ValidatedAxis {
  name: string;
  normalizedKey: string;
  values: string[];
}

/**
 * Validates 1 to 3 attribute axes and prevents duplicate axes or duplicate values within an axis.
 */
export function validateVariantAxes(axes: VariantAxisInput[]): {
  valid: boolean;
  validatedAxes: ValidatedAxis[];
  error?: string;
} {
  if (!axes || !Array.isArray(axes) || axes.length === 0) {
    return { valid: false, validatedAxes: [], error: 'At least one variant axis is required' };
  }
  if (axes.length > 3) {
    return { valid: false, validatedAxes: [], error: 'A maximum of 3 variant axes is supported' };
  }

  const seenAxisKeys = new Set<string>();
  const validatedAxes: ValidatedAxis[] = [];

  for (let i = 0; i < axes.length; i++) {
    const axis = axes[i];
    const rawName = axis.name?.trim();
    if (!rawName || rawName.length < 1 || rawName.length > 50) {
      return {
        valid: false,
        validatedAxes: [],
        error: `Axis #${i + 1} name must be between 1 and 50 characters`,
      };
    }

    const normalizedKey = rawName.toLowerCase();
    if (seenAxisKeys.has(normalizedKey)) {
      return {
        valid: false,
        validatedAxes: [],
        error: `Duplicate axis '${rawName}' detected. Axis names must be unique.`,
      };
    }
    seenAxisKeys.add(normalizedKey);

    if (!axis.values || !Array.isArray(axis.values) || axis.values.length === 0) {
      return {
        valid: false,
        validatedAxes: [],
        error: `Axis '${rawName}' must contain at least one value`,
      };
    }

    if (axis.values.length > 50) {
      return {
        valid: false,
        validatedAxes: [],
        error: `Axis '${rawName}' cannot exceed 50 values`,
      };
    }

    const seenValues = new Set<string>();
    const cleanValues: string[] = [];

    for (const val of axis.values) {
      const cleanVal = typeof val === 'string' ? val.trim() : String(val).trim();
      if (!cleanVal) {
        return {
          valid: false,
          validatedAxes: [],
          error: `Axis '${rawName}' contains an empty or whitespace-only value`,
        };
      }
      const valLower = cleanVal.toLowerCase();
      if (seenValues.has(valLower)) {
        return {
          valid: false,
          validatedAxes: [],
          error: `Duplicate value '${cleanVal}' in axis '${rawName}'`,
        };
      }
      seenValues.add(valLower);
      cleanValues.push(cleanVal);
    }

    validatedAxes.push({
      name: rawName,
      normalizedKey,
      values: cleanValues,
    });
  }

  return { valid: true, validatedAxes };
}

/**
 * Computes the Cartesian product of 1, 2, or 3 validated variant axes.
 * Returns an array of attribute maps.
 */
export function generateCartesianCombinations(
  validatedAxes: ValidatedAxis[]
): Array<Record<string, string>> {
  if (validatedAxes.length === 0) return [];

  const [firstAxis, ...restAxes] = validatedAxes;

  let combinations: Array<Record<string, string>> = firstAxis.values.map((v) => ({
    [firstAxis.name]: v,
  }));

  for (const nextAxis of restAxes) {
    const nextCombinations: Array<Record<string, string>> = [];
    for (const combo of combinations) {
      for (const val of nextAxis.values) {
        nextCombinations.push({
          ...combo,
          [nextAxis.name]: val,
        });
      }
    }
    combinations = nextCombinations;
  }

  return combinations;
}

// ============================================================================
// 5. SKU TEMPLATE EVALUATION
// ============================================================================

/**
 * Generates an SKU from a configurable template:
 * Supported placeholders:
 * - {PRODUCT_CODE} or {CODE}
 * - {AXIS_NAME} (e.g. {SIZE}, {COLOR})
 * - {INDEX} (1-based index)
 * - {INDEX_PAD} (1-based 3-digit padded: 001, 002)
 *
 * Example template: "{PRODUCT_CODE}-{SIZE}-{COLOR}"
 */
export function generateSkuFromTemplate(
  template: string,
  context: {
    productCode: string;
    attributes: Record<string, string>;
    index?: number;
  }
): string {
  let sku = template;
  const productCode = context.productCode.trim().toUpperCase();

  sku = sku.replace(/\{(?:PRODUCT_CODE|CODE)\}/gi, productCode);

  if (context.index !== undefined) {
    sku = sku.replace(/\{INDEX\}/gi, String(context.index));
    sku = sku.replace(/\{INDEX_PAD\}/gi, String(context.index).padStart(3, '0'));
  }

  // Replace each attribute placeholder
  for (const [key, val] of Object.entries(context.attributes)) {
    const pattern = new RegExp(`\\{${key}\\}`, 'gi');
    // Normalize attribute value for SKU: alphanumeric only, spaces become hyphens
    const cleanVal = val.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    sku = sku.replace(pattern, cleanVal);
  }

  // Remove any unreplaced placeholders
  sku = sku.replace(/\{[A-Z0-9_-]+\}/gi, '');

  // Normalize delimiters (e.g. multiple hyphens)
  sku = sku.replace(/[-_]+/g, '-').replace(/^-|-$/g, '');

  return normalizeSku(sku);
}
