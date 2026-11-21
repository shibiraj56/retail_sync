import { z } from 'zod';

export const SafeIntegerMoneySchema = z
  .number()
  .int('Monetary amounts must be an integer in minor units (paise/cents)')
  .min(0, 'Monetary amounts cannot be negative')
  .max(Number.MAX_SAFE_INTEGER, 'Monetary amounts must not exceed JavaScript safe integer limit');

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

export const UomTypeSchema = z.enum(['COUNT', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA']);
export const UomStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

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

export const CategoryStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

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

export const BrandStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

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
// PRODUCT MASTER SCHEMAS
// ============================================================================

export const ProductStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);

export const ProductImageSchema = z.object({
  url: z.string().url('Invalid image URL'),
  isPrimary: z.boolean().default(false),
  storagePath: z.string().min(1, 'Storage path is required'),
});

export const UpsertProductInputSchema = z
  .object({
    organizationId: z.string().min(1, 'Organization ID is required'),
    id: z.string().optional(),
    name: z.string().trim().min(1, 'Product name is required').max(200),
    code: NormalizedCodeSchema,
    description: z.string().max(2000).optional(),
    categoryId: z.string().min(1, 'Category is required'),
    brandId: z.string().nullable().optional(),
    baseUomId: z.string().min(1, 'Base unit of measure is required'),
    secondaryUomId: z.string().nullable().optional(),
    uomConversionFactor: z.number().positive('Conversion factor must be positive').nullable().optional(),
    taxData: z.object({
      codeType: z.enum(['HSN', 'SAC']),
      code: HsnSacCodeSchema,
      taxCategory: z.enum(['STANDARD', 'EXEMPT', 'ZERO_RATED']).default('STANDARD'),
      taxSlabId: z.string().min(1, 'Tax slab ID is required'),
      taxRatePercent: z.number().min(0).max(100),
      pricingType: z.enum(['TAX_INCLUSIVE', 'TAX_EXCLUSIVE']).default('TAX_INCLUSIVE'),
    }),
    pricingPolicy: z.object({
      requiresMrp: z.boolean().default(true),
      allowWholesale: z.boolean().default(false),
    }),
    trackingFlags: z.object({
      trackBatches: z.boolean().default(false),
      trackSerials: z.boolean().default(false),
    }),
    images: z.array(ProductImageSchema).default([]),
    status: ProductStatusSchema.default('ACTIVE'),
  })
  .refine(
    (data) => {
      if (data.secondaryUomId && data.secondaryUomId === data.baseUomId) {
        return false;
      }
      return true;
    },
    {
      message: 'Secondary unit cannot be identical to base unit',
      path: ['secondaryUomId'],
    }
  )
  .refine(
    (data) => {
      if (data.secondaryUomId && (!data.uomConversionFactor || data.uomConversionFactor <= 0)) {
        return false;
      }
      return true;
    },
    {
      message: 'Conversion factor is required when secondary unit is configured',
      path: ['uomConversionFactor'],
    }
  );

export type UpsertProductInput = z.infer<typeof UpsertProductInputSchema>;
