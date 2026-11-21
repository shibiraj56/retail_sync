import { z } from 'zod';
import { SafeIntegerMoneySchema, NormalizedCodeSchema } from './catalog';
import { VariantPricingSchema } from './variants';

// ============================================================================
// 1. TAX CONFIGURATION SCHEMAS
// ============================================================================

export const TaxComponentTypeSchema = z.enum(['CGST', 'SGST', 'IGST', 'CESS', 'VAT']);

export const TaxComponentConfigSchema = z.object({
  name: z.string().trim().min(1).max(50),
  ratePercent: z.number().min(0).max(100),
  type: TaxComponentTypeSchema,
});

export const TaxJurisdictionSchema = z.enum(['INDIA_GST', 'GENERIC_VAT', 'CUSTOM']);
export const TaxConfigStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

export const UpsertTaxConfigurationInputSchema = z
  .object({
    organizationId: z.string().min(1, 'Organization ID is required'),
    id: z.string().optional(),
    name: z.string().trim().min(1, 'Tax slab name is required').max(100),
    code: NormalizedCodeSchema,
    ratePercent: z.number().min(0, 'Tax rate cannot be negative').max(100, 'Tax rate cannot exceed 100%'),
    components: z.array(TaxComponentConfigSchema).default([]),
    effectiveStartDate: z.string().min(1, 'Effective start date is required'),
    effectiveEndDate: z.string().nullable().optional(),
    jurisdiction: TaxJurisdictionSchema.default('INDIA_GST'),
    status: TaxConfigStatusSchema.default('ACTIVE'),
  })
  .refine(
    (data) => {
      // Sum of component rates should equal ratePercent if components are provided
      if (data.components.length > 0) {
        const componentSum = data.components.reduce((sum, c) => sum + c.ratePercent, 0);
        // Allow minor rounding difference (< 0.01)
        if (Math.abs(componentSum - data.ratePercent) > 0.01) {
          return false;
        }
      }
      return true;
    },
    {
      message: 'Sum of tax component rates must equal the total tax rate percent',
      path: ['components'],
    }
  );

export type UpsertTaxConfigurationInput = z.infer<typeof UpsertTaxConfigurationInputSchema>;

// ============================================================================
// 2. PRICING RULES & HIERARCHY SCHEMAS
// ============================================================================

export const PricingLevelSchema = z.enum(['ORGANIZATION', 'STORE', 'PRODUCT', 'VARIANT', 'CUSTOMER_GROUP', 'CUSTOMER']);
export const PricingRuleStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);

export const UpsertPricingRuleInputSchema = z
  .object({
    organizationId: z.string().min(1, 'Organization ID is required'),
    id: z.string().optional(),
    level: z.enum(['STORE', 'CUSTOMER_GROUP', 'CUSTOMER']),
    targetEntityId: z.string().min(1, 'Target entity ID (storeId / customerId / customerGroupId) is required'),
    productId: z.string().min(1, 'Product ID is required'),
    variantId: z.string().nullable().optional(),
    priceMinor: SafeIntegerMoneySchema,
    currency: z.string().default('INR'),
    effectiveStartDate: z.string().min(1, 'Effective start date is required'),
    effectiveEndDate: z.string().nullable().optional(),
    status: PricingRuleStatusSchema.default('ACTIVE'),
    reason: z.string().max(250).optional(),
  })
  .refine(
    (data) => {
      if (data.effectiveEndDate) {
        const start = new Date(data.effectiveStartDate).getTime();
        const end = new Date(data.effectiveEndDate).getTime();
        if (end <= start) {
          return false;
        }
      }
      return true;
    },
    {
      message: 'Effective end date must be strictly after effective start date',
      path: ['effectiveEndDate'],
    }
  );

export type UpsertPricingRuleInput = z.infer<typeof UpsertPricingRuleInputSchema>;

// ============================================================================
// 3. BULK PRICING UPDATES SCHEMAS
// ============================================================================

export const BulkVariantPriceItemSchema = z.object({
  variantId: z.string().min(1),
  pricing: VariantPricingSchema,
});

export const BulkUpdateVariantPricingInputSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  productId: z.string().min(1, 'Product ID is required'),
  updates: z.array(BulkVariantPriceItemSchema).min(1).max(50, 'Bulk price updates bounded to 50 items per batch'),
  reason: z.string().max(250).optional(),
});

export type BulkUpdateVariantPricingInput = z.infer<typeof BulkUpdateVariantPricingInputSchema>;

// ============================================================================
// 4. PREVIEW & EVALUATION SCHEMAS
// ============================================================================

export const GetEffectivePriceInputSchema = z.object({
  organizationId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().optional(),
  storeId: z.string().optional(),
  customerId: z.string().optional(),
  customerGroupId: z.string().optional(),
  atTimestamp: z.string().optional(),
});

export type GetEffectivePriceInput = z.infer<typeof GetEffectivePriceInputSchema>;

export const CalculateTaxCallableInputSchema = z.object({
  organizationId: z.string().min(1),
  baseAmountMinor: SafeIntegerMoneySchema,
  pricingType: z.enum(['TAX_INCLUSIVE', 'TAX_EXCLUSIVE']),
  taxRatePercent: z.number().min(0).max(100),
  originStateCode: z.string().min(1),
  destinationStateCode: z.string().min(1),
  discountAmountMinor: SafeIntegerMoneySchema.optional().default(0),
});

export type CalculateTaxCallableInput = z.infer<typeof CalculateTaxCallableInputSchema>;
