import { z } from 'zod';
import {
  SafeIntegerMoneySchema,
} from './catalog';
import {
  validateSku,
  detectAndValidateBarcode,
  validateVariantAxes,
} from '../shared/identifiers';

// ============================================================================
// 1. VARIANT AXES SCHEMAS
// ============================================================================

export const VariantAxisSchema = z.object({
  name: z.string().trim().min(1, 'Axis name is required').max(50),
  values: z.array(z.string().trim().min(1, 'Value cannot be empty').max(50)).min(1, 'At least one value is required').max(50),
});

export const VariantAxesListSchema = z
  .array(VariantAxisSchema)
  .min(1, 'At least one variant axis is required')
  .max(3, 'Maximum of 3 variant axes is permitted')
  .refine(
    (axes) => {
      const validation = validateVariantAxes(axes);
      return validation.valid;
    },
    (axes) => {
      const validation = validateVariantAxes(axes);
      return { message: validation.error || 'Invalid variant axes configuration' };
    }
  );

// ============================================================================
// 2. PRICING SCHEMAS
// ============================================================================

export const VariantPricingSchema = z
  .object({
    mrp: SafeIntegerMoneySchema,
    sellingPrice: SafeIntegerMoneySchema,
    costPrice: SafeIntegerMoneySchema,
    wholesalePrice: SafeIntegerMoneySchema.optional(),
    minimumSellingPrice: SafeIntegerMoneySchema.optional(),
  })
  .refine(
    (data) => {
      // Selling price should not exceed MRP if MRP is positive
      if (data.mrp > 0 && data.sellingPrice > data.mrp) {
        return false;
      }
      return true;
    },
    {
      message: 'Selling price cannot exceed Maximum Retail Price (MRP)',
      path: ['sellingPrice'],
    }
  )
  .refine(
    (data) => {
      // Minimum selling price should not exceed selling price
      if (data.minimumSellingPrice !== undefined && data.minimumSellingPrice > data.sellingPrice) {
        return false;
      }
      return true;
    },
    {
      message: 'Minimum selling price cannot exceed the base selling price',
      path: ['minimumSellingPrice'],
    }
  );

export type VariantPricing = z.infer<typeof VariantPricingSchema>;

// ============================================================================
// 3. VARIANT DOCUMENT & ITEM SCHEMAS
// ============================================================================

export const VariantStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
export type VariantStatus = z.infer<typeof VariantStatusSchema>;

export const VariantBarcodeSchema = z
  .string()
  .trim()
  .refine(
    (val) => detectAndValidateBarcode(val).valid,
    (val) => ({ message: detectAndValidateBarcode(val).error || 'Invalid barcode format or check digit' })
  );

export const VariantSkuSchema = z
  .string()
  .trim()
  .refine(
    (val) => validateSku(val).valid,
    (val) => ({ message: validateSku(val).error || 'Invalid SKU format' })
  );

export const UpsertVariantItemSchema = z
  .object({
    id: z.string().optional(),
    sku: VariantSkuSchema,
    barcode: VariantBarcodeSchema,
    additionalBarcodes: z.array(VariantBarcodeSchema).max(5, 'Maximum 5 additional barcodes allowed').optional(),
    attributeValues: z.record(z.string().min(1)),
    pricing: VariantPricingSchema,
    taxRatePercent: z.number().min(0).max(100).default(0),
    trackInventory: z.boolean().default(true),
    reorderPoint: z.number().int().min(0).default(0),
    status: VariantStatusSchema.default('ACTIVE'),
  })
  .refine(
    (data) => {
      // Ensure no duplicate barcodes within the same variant
      if (data.additionalBarcodes && data.additionalBarcodes.length > 0) {
        const normalizedMain = data.barcode.trim().toUpperCase();
        const allBarcodes = [normalizedMain, ...data.additionalBarcodes.map((b) => b.trim().toUpperCase())];
        const uniqueBarcodes = new Set(allBarcodes);
        if (uniqueBarcodes.size !== allBarcodes.length) {
          return false;
        }
      }
      return true;
    },
    {
      message: 'Duplicate barcode assigned within the same variant',
      path: ['additionalBarcodes'],
    }
  );

export type UpsertVariantItem = z.infer<typeof UpsertVariantItemSchema>;

// ============================================================================
// 4. SYNCHRONOUS TRANSACTION INPUT (BOUNDED <= 50 VARIANTS)
// ============================================================================

export const SaveVariantsSyncInputSchema = z
  .object({
    organizationId: z.string().min(1, 'Organization ID is required'),
    productId: z.string().min(1, 'Product ID is required'),
    axes: VariantAxesListSchema.optional(),
    variants: z
      .array(UpsertVariantItemSchema)
      .min(1, 'At least one variant must be provided')
      .max(50, 'Synchronous processing is strictly bounded to 50 variants per transaction. Use staged background jobs for larger matrices.'),
  })
  .refine(
    (data) => {
      // Verify no duplicate SKUs within the incoming batch
      const skus = data.variants.map((v) => v.sku.trim().toUpperCase());
      const uniqueSkus = new Set(skus);
      return uniqueSkus.size === skus.length;
    },
    {
      message: 'Batch contains duplicate SKUs within itself',
      path: ['variants'],
    }
  )
  .refine(
    (data) => {
      // Verify no duplicate barcodes within the incoming batch
      const allBarcodes: string[] = [];
      for (const v of data.variants) {
        allBarcodes.push(v.barcode.trim().toUpperCase());
        if (v.additionalBarcodes) {
          for (const b of v.additionalBarcodes) {
            allBarcodes.push(b.trim().toUpperCase());
          }
        }
      }
      const uniqueBarcodes = new Set(allBarcodes);
      return uniqueBarcodes.size === allBarcodes.length;
    },
    {
      message: 'Batch contains duplicate barcodes within itself',
      path: ['variants'],
    }
  );

export type SaveVariantsSyncInput = z.infer<typeof SaveVariantsSyncInputSchema>;

// ============================================================================
// 5. STAGED BACKGROUND JOB SCHEMAS (LARGE MATRICES)
// ============================================================================

export const CreateVariantMatrixJobInputSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  productId: z.string().min(1, 'Product ID is required'),
  axes: VariantAxesListSchema,
  skuTemplate: z.string().min(1).default('{PRODUCT_CODE}-{INDEX_PAD}'),
  defaultPricing: VariantPricingSchema,
  defaultTaxRatePercent: z.number().min(0).max(100).default(0),
  defaultTrackInventory: z.boolean().default(true),
});

export type CreateVariantMatrixJobInput = z.infer<typeof CreateVariantMatrixJobInputSchema>;

export const ProcessJobChunkInputSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  jobId: z.string().min(1, 'Job ID is required'),
  workerId: z.string().min(1, 'Worker ID is required'),
  expectedFencingToken: z.number().int().min(1),
});

export type ProcessJobChunkInput = z.infer<typeof ProcessJobChunkInputSchema>;

// ============================================================================
// 6. SINGLE VARIANT & IDENTIFIER VALIDATION SCHEMAS
// ============================================================================

export const UpsertSingleVariantInputSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  productId: z.string().min(1, 'Product ID is required'),
  variant: UpsertVariantItemSchema,
});

export type UpsertSingleVariantInput = z.infer<typeof UpsertSingleVariantInputSchema>;

export const ArchiveVariantInputSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  productId: z.string().min(1, 'Product ID is required'),
  variantId: z.string().min(1, 'Variant ID is required'),
});

export type ArchiveVariantInput = z.infer<typeof ArchiveVariantInputSchema>;

export const ValidateIdentifierInputSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  type: z.enum(['SKU', 'BARCODE']),
  value: z.string().trim().min(1),
  excludeVariantId: z.string().optional(),
});

export type ValidateIdentifierInput = z.infer<typeof ValidateIdentifierInputSchema>;
