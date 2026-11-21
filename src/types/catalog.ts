import { z } from 'zod';

// ============================================================================
// 1. FINANCIAL & SAFE INTEGER LIMIT SAFEGUARDS
// ============================================================================

/**
 * JavaScript Safe Integer Money representation:
 * All monetary amounts are stored as non-negative integers in minor units (e.g. Paise in INR: ₹100.50 -> 10050).
 * Maximum safe integer in JS: Number.MAX_SAFE_INTEGER (9,007,199,254,740,991).
 */
export const SafeIntegerMoneySchema = z
  .number()
  .int('Monetary amounts must be an integer in minor units (paise/cents)')
  .min(0, 'Monetary amounts cannot be negative')
  .max(Number.MAX_SAFE_INTEGER, 'Monetary amounts must not exceed JavaScript safe integer limit');

// ============================================================================
// 2. IDENTIFIER & CODE NORMALIZATION SCHEMAS
// ============================================================================

export const NormalizedCodeSchema = z
  .string()
  .trim()
  .min(2, 'Code must be at least 2 characters')
  .max(30, 'Code must be at most 30 characters')
  .regex(/^[A-Z0-9_-]+$/, 'Code must contain only uppercase alphanumeric characters, underscores, or hyphens');

export const HsnSacCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{4,8}$/, 'HSN/SAC code must be 4 to 8 numeric digits');

// ============================================================================
// 3. UNITS OF MEASURE (UoM)
// ============================================================================

export type UomType = 'COUNT' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA';
export type UomStatus = 'ACTIVE' | 'ARCHIVED';

export const UomTypeSchema = z.enum(['COUNT', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA']);
export const UomStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

export interface UnitOfMeasureDocument {
  id: string; // e.g., "uom_pcs", "uom_kg"
  organizationId: string;
  name: string; // e.g. "Piece", "Kilogram", "Box"
  symbol: string; // e.g. "PCS", "KG", "BOX" (normalized uppercase)
  type: UomType;
  allowDecimals: boolean;
  decimalPrecision: number; // 0 for COUNT; 2-3 for WEIGHT/VOLUME/LENGTH
  isSystemDefault: boolean;
  status: UomStatus;
  createdAt: string;
  updatedAt: string;
}

export const UpsertUomInputSchema = z
  .object({
    organizationId: z.string().min(1, 'Organization ID is required'),
    id: z.string().optional(),
    name: z.string().trim().min(1, 'UoM name is required').max(50),
    symbol: z
      .string()
      .trim()
      .min(1, 'UoM symbol is required')
      .max(10)
      .transform((val) => val.toUpperCase()),
    type: UomTypeSchema,
    allowDecimals: z.boolean(),
    decimalPrecision: z.number().int().min(0).max(4).default(0),
    status: UomStatusSchema.default('ACTIVE'),
  })
  .refine(
    (data) => {
      if (!data.allowDecimals && data.decimalPrecision > 0) {
        return false;
      }
      return true;
    },
    {
      message: 'Decimal precision must be 0 when allowDecimals is false',
      path: ['decimalPrecision'],
    }
  );

export type UpsertUomInput = z.infer<typeof UpsertUomInputSchema>;

// Conversion validation between two units
export const UomConversionRuleSchema = z
  .object({
    baseUomId: z.string().min(1),
    baseUomType: UomTypeSchema,
    secondaryUomId: z.string().min(1),
    secondaryUomType: UomTypeSchema,
    // 1 Secondary = conversionFactor * Base
    conversionFactor: z.number().positive('Conversion factor must be strictly greater than 0'),
  })
  .refine(
    (data) => {
      // Incompatible conversion rule: Cannot convert Weight into Count directly without density/item context
      if (data.baseUomType !== data.secondaryUomType && data.secondaryUomType !== 'COUNT') {
        return false;
      }
      return true;
    },
    {
      message: 'Secondary and base units must belong to compatible measurement dimensions',
      path: ['secondaryUomType'],
    }
  );

// ============================================================================
// 4. CATEGORIES
// ============================================================================

export type CategoryStatus = 'ACTIVE' | 'ARCHIVED';
export const CategoryStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

export interface CategoryDocument {
  id: string;
  organizationId: string;
  name: string;
  code: string; // Normalized uppercase alphanumeric
  slug: string;
  parentId: string | null; // null = Root (Level 1), string = Subcategory (Level 2)
  level: 1 | 2; // Strict 2-level maximum hierarchy
  description?: string;
  defaultTaxClassification?: {
    codeType: 'HSN' | 'SAC';
    code: string;
    taxSlabId: string;
    taxRatePercent: number;
  };
  displayOrder: number;
  status: CategoryStatus;
  createdAt: string;
  updatedAt: string;
}

export const UpsertCategoryInputSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Category name is required').max(100),
  code: NormalizedCodeSchema,
  parentId: z.string().nullable().default(null),
  description: z.string().max(500).optional(),
  defaultTaxClassification: z
    .object({
      codeType: z.enum(['HSN', 'SAC']),
      code: HsnSacCodeSchema,
      taxSlabId: z.string().min(1),
      taxRatePercent: z.number().min(0).max(100),
    })
    .optional(),
  displayOrder: z.number().int().min(0).default(0),
  status: CategoryStatusSchema.default('ACTIVE'),
});

export type UpsertCategoryInput = z.infer<typeof UpsertCategoryInputSchema>;

// ============================================================================
// 5. BRANDS
// ============================================================================

export type BrandStatus = 'ACTIVE' | 'ARCHIVED';
export const BrandStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

export interface BrandDocument {
  id: string;
  organizationId: string;
  name: string;
  code: string; // Normalized uppercase alphanumeric
  logoUrl?: string;
  description?: string;
  manufacturerName?: string;
  supportEmail?: string;
  supportPhone?: string;
  status: BrandStatus;
  createdAt: string;
  updatedAt: string;
}

export const UpsertBrandInputSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Brand name is required').max(100),
  code: NormalizedCodeSchema,
  logoUrl: z.string().url('Invalid logo URL').or(z.literal('')).optional(),
  description: z.string().max(500).optional(),
  manufacturerName: z.string().max(100).optional(),
  supportEmail: z.string().email('Invalid support email').or(z.literal('')).optional(),
  supportPhone: z.string().max(20).optional(),
  status: BrandStatusSchema.default('ACTIVE'),
});

export type UpsertBrandInput = z.infer<typeof UpsertBrandInputSchema>;

// ============================================================================
// 6. SYSTEM DEFAULT UNITS SEED SPECIFICATION
// ============================================================================

export const SYSTEM_DEFAULT_UOMS: Array<Omit<UnitOfMeasureDocument, 'organizationId' | 'createdAt' | 'updatedAt'>> = [
  {
    id: 'uom_pcs',
    name: 'Piece',
    symbol: 'PCS',
    type: 'COUNT',
    allowDecimals: false,
    decimalPrecision: 0,
    isSystemDefault: true,
    status: 'ACTIVE',
  },
  {
    id: 'uom_kg',
    name: 'Kilogram',
    symbol: 'KG',
    type: 'WEIGHT',
    allowDecimals: true,
    decimalPrecision: 3,
    isSystemDefault: true,
    status: 'ACTIVE',
  },
  {
    id: 'uom_gm',
    name: 'Gram',
    symbol: 'GM',
    type: 'WEIGHT',
    allowDecimals: true,
    decimalPrecision: 2,
    isSystemDefault: true,
    status: 'ACTIVE',
  },
  {
    id: 'uom_mtr',
    name: 'Meter',
    symbol: 'MTR',
    type: 'LENGTH',
    allowDecimals: true,
    decimalPrecision: 2,
    isSystemDefault: true,
    status: 'ACTIVE',
  },
  {
    id: 'uom_ltr',
    name: 'Liter',
    symbol: 'LTR',
    type: 'VOLUME',
    allowDecimals: true,
    decimalPrecision: 3,
    isSystemDefault: true,
    status: 'ACTIVE',
  },
  {
    id: 'uom_box',
    name: 'Box',
    symbol: 'BOX',
    type: 'COUNT',
    allowDecimals: false,
    decimalPrecision: 0,
    isSystemDefault: true,
    status: 'ACTIVE',
  },
  {
    id: 'uom_set',
    name: 'Set',
    symbol: 'SET',
    type: 'COUNT',
    allowDecimals: false,
    decimalPrecision: 0,
    isSystemDefault: true,
    status: 'ACTIVE',
  },
];
