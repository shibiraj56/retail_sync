// ============================================================================
// CLIENT-SIDE MONEY UTILITY (INTEGER MINOR UNITS / PAISE)
// ============================================================================

export const MAX_SAFE_MONEY_INTEGER = Number.MAX_SAFE_INTEGER;
export const MAX_SAFE_MONEY_PAISE = MAX_SAFE_MONEY_INTEGER;

export const rupeesToPaise = toMinorUnits;
export const paiseToRupees = toMajorUnits;
export const roundHalfUp = Math.round;
export const assertSafeMoneyMinor = assertMinorUnits;

export function isValidMinorUnits(amount: unknown): amount is number {
  return (
    typeof amount === 'number' &&
    Number.isInteger(amount) &&
    amount >= 0 &&
    amount <= MAX_SAFE_MONEY_INTEGER
  );
}

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

export function toMinorUnits(majorAmount: number, minorUnitFactor: number = 100): number {
  if (typeof majorAmount !== 'number' || isNaN(majorAmount)) {
    throw new TypeError(`Invalid major currency amount: ${majorAmount}`);
  }
  const minor = Math.round(majorAmount * minorUnitFactor);
  assertMinorUnits(minor, 'Converted minor units');
  return minor;
}

export function toMajorUnits(minorAmount: number, minorUnitFactor: number = 100): number {
  assertMinorUnits(minorAmount, 'Minor amount');
  return minorAmount / minorUnitFactor;
}

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

export function subtractMoney(minuend: number, subtrahend: number, allowNegative: boolean = false): number {
  assertMinorUnits(minuend, 'Minuend');
  assertMinorUnits(subtrahend, 'Subtrahend');
  const result = minuend - subtrahend;
  if (!allowNegative && result < 0) {
    throw new RangeError(`Financial subtraction would result in negative value: ${minuend} - ${subtrahend} = ${result}`);
  }
  return result;
}

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
  mrp: number;
  sellingPrice: number;
  costPrice: number;
  minimumSellingPrice?: number;
  wholesalePrice?: number;
}

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
