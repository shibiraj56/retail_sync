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
