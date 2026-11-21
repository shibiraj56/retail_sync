import { z } from 'zod';
import {
  SafeIntegerMoneySchema,
} from './catalog';
import {
  validateSku,
  detectAndValidateBarcode,
  validateVariantAxes,
} from '../lib/identifiers';

export const VariantAxisSchema = z.object({
  name: z.string().trim().min(1, 'Axis name is required').max(50),
  values: z.array(z.string().trim().min(1, 'Value cannot be empty').max(50)).min(1, 'At least one value is required').max(50),
});

export type VariantAxis = z.infer<typeof VariantAxisSchema>;

export const VariantAxesListSchema = z
  .array(VariantAxisSchema)
  .min(1, 'At least one variant axis is required')
  .max(3, 'Maximum of 3 variant axes is permitted')
  .refine(
    (axes) => validateVariantAxes(axes).valid,
    (axes) => ({ message: validateVariantAxes(axes).error || 'Invalid variant axes configuration' })
  );

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
      if (data.mrp > 0 && data.sellingPrice > data.mrp) {
        return false;
      }
      return true;
    },
    {
      message: 'Selling price cannot exceed Maximum Retail Price (MRP)',
      path: ['sellingPrice'],
    }
  );

export type VariantPricing = z.infer<typeof VariantPricingSchema>;

export type VariantStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface ProductVariantDocument {
  id: string;
  productId: string;
  organizationId: string;
  sku: string;
  barcode: string;
  additionalBarcodes?: string[];
  attributeValues: Record<string, string>;
  pricing: VariantPricing;
  taxRatePercent: number;
  trackInventory: boolean;
  reorderPoint: number;
  status: VariantStatus;
  createdAt: string;
  updatedAt: string;
}

export const UpsertVariantItemSchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().refine((val) => validateSku(val).valid, 'Invalid SKU format'),
  barcode: z.string().trim().refine((val) => detectAndValidateBarcode(val).valid, 'Invalid barcode'),
  additionalBarcodes: z.array(z.string().trim()).max(5).optional(),
  attributeValues: z.record(z.string()),
  pricing: VariantPricingSchema,
  taxRatePercent: z.number().min(0).max(100).default(0),
  trackInventory: z.boolean().default(true),
  reorderPoint: z.number().int().min(0).default(0),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('ACTIVE'),
});

export type UpsertVariantItem = z.infer<typeof UpsertVariantItemSchema>;

export interface SaveVariantsSyncInput {
  organizationId: string;
  productId: string;
  axes?: VariantAxis[];
  variants: UpsertVariantItem[];
}

export interface VariantMatrixJobDocument {
  id: string;
  organizationId: string;
  productId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIALLY_FAILED';
  totalCombinations: number;
  processedCount: number;
  failedCount: number;
  currentChunkIndex: number;
  totalChunks: number;
  chunkSize: number;
  fencingToken: number;
  leaseWorkerId?: string | null;
  leaseExpiresAt?: any;
  errors?: Array<{ variantIndex: number; sku?: string; reason: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVariantMatrixJobInput {
  organizationId: string;
  productId: string;
  axes: VariantAxis[];
  skuTemplate: string;
  defaultPricing: VariantPricing;
  defaultTaxRatePercent: number;
  defaultTrackInventory: boolean;
}
