// ============================================================================
// CLIENT-SIDE IDENTIFIER & BARCODE UTILITIES
// ============================================================================

export function validateEan13CheckDigit(barcode: string): boolean {
  const trimmed = barcode.trim();
  if (!/^\d{13}$/.test(trimmed)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(trimmed.charAt(i), 10);
    sum += i % 2 === 0 ? digit * 1 : digit * 3;
  }

  const remainder = sum % 10;
  const expectedCheckDigit = remainder === 0 ? 0 : 10 - remainder;
  const actualCheckDigit = parseInt(trimmed.charAt(12), 10);

  return expectedCheckDigit === actualCheckDigit;
}

export function validateUpcaCheckDigit(barcode: string): boolean {
  const trimmed = barcode.trim();
  if (!/^\d{12}$/.test(trimmed)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(trimmed.charAt(i), 10);
    sum += i % 2 === 0 ? digit * 3 : digit * 1;
  }

  const remainder = sum % 10;
  const expectedCheckDigit = remainder === 0 ? 0 : 10 - remainder;
  const actualCheckDigit = parseInt(trimmed.charAt(11), 10);

  return expectedCheckDigit === actualCheckDigit;
}

export function validateCode128(barcode: string): boolean {
  const trimmed = barcode.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return false;
  }
  return /^[\x20-\x7E]+$/.test(trimmed);
}

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

export function detectAndValidateBarcode(rawBarcode: string): BarcodeValidationResult {
  if (!rawBarcode || typeof rawBarcode !== 'string') {
    return { valid: false, type: 'INVALID', normalized: '', error: 'Barcode must be a non-empty string' };
  }

  const trimmed = rawBarcode.trim();
  if (trimmed.length === 0) {
    return { valid: false, type: 'INVALID', normalized: '', error: 'Barcode cannot be empty or whitespace' };
  }

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

  const normalizedCustom = trimmed.toUpperCase();
  if (/^[A-Z0-9_-]{2,50}$/.test(normalizedCustom)) {
    return { valid: true, type: 'CUSTOM', normalized: normalizedCustom };
  }

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

export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

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

export function canonicalizeAttributes(attributes: Record<string, string>): string {
  const normalizedEntries = Object.entries(attributes).map(([k, v]) => [
    k.trim().toLowerCase(),
    v.trim(),
  ]);

  normalizedEntries.sort((a, b) => a[0].localeCompare(b[0]));
  return normalizedEntries.map(([k, v]) => `${k}=${v}`).join(';');
}

/**
 * Fast synchronous DJB2/FNV-1a 64-bit hash fallback for browser if node crypto unavailable.
 */
function fastHash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return part1 + part2;
}

export function generateDeterministicVariantId(
  productId: string,
  attributes: Record<string, string>
): string {
  const canonical = canonicalizeAttributes(attributes);
  const rawInput = `${productId.trim()}::${canonical}`;
  // Use fast 64-bit hex hash
  const hash = fastHash(rawInput);
  return `var_${hash.slice(0, 16)}`;
}

export interface VariantAxisInput {
  name: string;
  values: string[];
}

export interface ValidatedAxis {
  name: string;
  normalizedKey: string;
  values: string[];
}

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

  for (const [key, val] of Object.entries(context.attributes)) {
    const pattern = new RegExp(`\\{${key}\\}`, 'gi');
    const cleanVal = val.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    sku = sku.replace(pattern, cleanVal);
  }

  sku = sku.replace(/\{[A-Z0-9_-]+\}/gi, '');
  sku = sku.replace(/[-_]+/g, '-').replace(/^-|-$/g, '');

  return normalizeSku(sku);
}
