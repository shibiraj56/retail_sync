// ============================================================================
// CENTRALIZED MONEY UTILITY (INTEGER MINOR UNITS / PAISE)
// ============================================================================

export const MAX_SAFE_MONEY_INTEGER = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991 minor units
export const MAX_SAFE_MONEY_PAISE = MAX_SAFE_MONEY_INTEGER;

export const rupeesToPaise = toMinorUnits;
export const paiseToRupees = toMajorUnits;
export const roundHalfUp = Math.round;
export const assertSafeMoneyMinor = assertMinorUnits;

/**
 * Validates that an amount is a valid non-negative JavaScript safe integer representing minor units (paise/cents).
 */
export function isValidMinorUnits(amount: unknown): amount is number {
  return (
    typeof amount === 'number' &&
    Number.isInteger(amount) &&
    amount >= 0 &&
    amount <= MAX_SAFE_MONEY_INTEGER
  );
}

/**
 * Asserts that an amount is a valid non-negative minor unit integer.
 */
export function assertMinorUnits(amount: number, label: string = 'Amount'): void {
  if (!Number.isInteger(amount)) {
    throw new TypeError(`${label} must be an integer in minor units (e.g. paise), received: ${amount}`);
  }
  if (amount < 0) {
    throw new RangeError(`${label} cannot be negative, received: ${amount}`);
  }
  if (amount > MAX_SAFE_MONEY_INTEGER) {
    throw new RangeError(`${label} exceeds maximum safe integer money limit`);
  }
}

/**
 * Converts decimal major units (e.g. ₹100.50) to integer minor units (10050 paise).
 * Uses standard commercial half-up rounding to prevent IEEE 754 precision artifacts.
 */
export function toMinorUnits(majorAmount: number, minorUnitFactor: number = 100): number {
  if (typeof majorAmount !== 'number' || isNaN(majorAmount)) {
    throw new TypeError(`Invalid major currency amount: ${majorAmount}`);
  }
  const minor = Math.round(majorAmount * minorUnitFactor);
  assertMinorUnits(minor, 'Converted minor units');
  return minor;
}

/**
 * Converts integer minor units (10050 paise) to major currency units (100.5).
 */
export function toMajorUnits(minorAmount: number, minorUnitFactor: number = 100): number {
  assertMinorUnits(minorAmount, 'Minor amount');
  return minorAmount / minorUnitFactor;
}

/**
 * Formats integer minor units into display string (e.g. "₹100.50" or "₹1,250.00").
 */
export function formatMoney(
  minorAmount: number,
  currency: string = 'INR',
  locale: string = 'en-IN',
  minorUnitFactor: number = 100
): string {
  const major = toMajorUnits(minorAmount, minorUnitFactor);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major);
}

/**
 * Adds multiple minor unit amounts safely with overflow assertions.
 */
export function addMoney(...amounts: number[]): number {
  let sum = 0;
  for (const amt of amounts) {
    assertMinorUnits(amt);
    sum += amt;
    if (sum > MAX_SAFE_MONEY_INTEGER) {
      throw new RangeError('Financial addition resulted in safe integer overflow');
    }
  }
  return sum;
}

/**
 * Subtracts subtrahend from minuend with non-negative guard.
 */
export function subtractMoney(minuend: number, subtrahend: number, allowNegative: boolean = false): number {
  assertMinorUnits(minuend, 'Minuend');
  assertMinorUnits(subtrahend, 'Subtrahend');
  const result = minuend - subtrahend;
  if (!allowNegative && result < 0) {
    throw new RangeError(`Financial subtraction would result in negative value: ${minuend} - ${subtrahend} = ${result}`);
  }
  return result;
}

/**
 * Multiplies an integer minor amount by a decimal multiplier (e.g. discount factor or percentage),
 * rounding half-up to the nearest minor unit.
 */
export function multiplyMoney(minorAmount: number, multiplier: number): number {
  assertMinorUnits(minorAmount, 'Minor amount');
  if (multiplier < 0) {
    throw new RangeError(`Multiplier cannot be negative: ${multiplier}`);
  }
  const result = Math.round(minorAmount * multiplier);
  assertMinorUnits(result, 'Multiplied money');
  return result;
}

export interface PriceRelationshipInput {
  mrp: number; // Maximum Retail Price
  sellingPrice: number; // Base selling price
  costPrice: number; // Purchase / landing cost
  minimumSellingPrice?: number; // Minimum floor price
  wholesalePrice?: number; // Bulk / wholesale tier
}

/**
 * Validates logical business relationships between prices:
 * 1. sellingPrice <= mrp (if mrp > 0)
 * 2. minimumSellingPrice <= sellingPrice
 * 3. wholesalePrice <= mrp (if mrp > 0 and wholesalePrice provided)
 */
export function validatePriceRelationship(pricing: PriceRelationshipInput): {
  valid: boolean;
  error?: string;
} {
  assertMinorUnits(pricing.mrp, 'MRP');
  assertMinorUnits(pricing.sellingPrice, 'Selling Price');
  assertMinorUnits(pricing.costPrice, 'Cost Price');

  if (pricing.mrp > 0 && pricing.sellingPrice > pricing.mrp) {
    return {
      valid: false,
      error: `Selling price (₹${pricing.sellingPrice / 100}) cannot exceed Maximum Retail Price (MRP: ₹${pricing.mrp / 100})`,
    };
  }

  if (pricing.minimumSellingPrice !== undefined) {
    assertMinorUnits(pricing.minimumSellingPrice, 'Minimum Selling Price');
    if (pricing.minimumSellingPrice > pricing.sellingPrice) {
      return {
        valid: false,
        error: `Minimum selling price (₹${pricing.minimumSellingPrice / 100}) cannot exceed standard selling price (₹${pricing.sellingPrice / 100})`,
      };
    }
  }

  if (pricing.wholesalePrice !== undefined) {
    assertMinorUnits(pricing.wholesalePrice, 'Wholesale Price');
    if (pricing.mrp > 0 && pricing.wholesalePrice > pricing.mrp) {
      return {
        valid: false,
        error: `Wholesale price (₹${pricing.wholesalePrice / 100}) cannot exceed MRP (₹${pricing.mrp / 100})`,
      };
    }
  }

  return { valid: true };
}
