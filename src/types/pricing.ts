import { z } from 'zod';
import { SafeIntegerMoneySchema, NormalizedCodeSchema } from './catalog';
import { type VariantPricing } from './variants';

export const TaxComponentTypeSchema = z.enum(['CGST', 'SGST', 'IGST', 'CESS', 'VAT']);
export type TaxComponentType = z.infer<typeof TaxComponentTypeSchema>;

export interface TaxComponentConfig {
  name: string;
  ratePercent: number;
  type: TaxComponentType;
}

export interface TaxConfigurationDocument {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  ratePercent: number;
  components: TaxComponentConfig[];
  effectiveStartDate: string;
  effectiveEndDate?: string | null;
  jurisdiction: 'INDIA_GST' | 'GENERIC_VAT' | 'CUSTOM';
  status: 'ACTIVE' | 'ARCHIVED';
  isSystemDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const UpsertTaxConfigurationInputSchema = z
  .object({
    organizationId: z.string().min(1, 'Organization ID is required'),
    id: z.string().optional(),
    name: z.string().trim().min(1, 'Tax slab name is required').max(100),
    code: NormalizedCodeSchema,
    ratePercent: z.number().min(0).max(100),
    components: z.array(z.object({
      name: z.string().trim().min(1),
      ratePercent: z.number().min(0).max(100),
      type: TaxComponentTypeSchema,
    })).default([]),
    effectiveStartDate: z.string().min(1, 'Effective start date is required'),
    effectiveEndDate: z.string().nullable().optional(),
    jurisdiction: z.enum(['INDIA_GST', 'GENERIC_VAT', 'CUSTOM']).default('INDIA_GST'),
    status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
  });

export type UpsertTaxConfigurationInput = z.infer<typeof UpsertTaxConfigurationInputSchema>;

export type PricingLevel = 'ORGANIZATION' | 'STORE' | 'PRODUCT' | 'VARIANT' | 'CUSTOMER_GROUP' | 'CUSTOMER';
export type PricingRuleStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface PricingRuleDocument {
  id: string;
  organizationId: string;
  level: 'STORE' | 'CUSTOMER_GROUP' | 'CUSTOMER';
  targetEntityId: string;
  productId: string;
  variantId?: string | null;
  priceMinor: number;
  currency: string;
  effectiveStartDate: string;
  effectiveEndDate?: string | null;
  status: PricingRuleStatus;
  reason?: string;
  createdAt: string;
  updatedAt: string;
}

export const UpsertPricingRuleInputSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  id: z.string().optional(),
  level: z.enum(['STORE', 'CUSTOMER_GROUP', 'CUSTOMER']),
  targetEntityId: z.string().min(1, 'Target entity ID is required'),
  productId: z.string().min(1, 'Product ID is required'),
  variantId: z.string().nullable().optional(),
  priceMinor: SafeIntegerMoneySchema,
  currency: z.string().default('INR'),
  effectiveStartDate: z.string().min(1, 'Effective start date is required'),
  effectiveEndDate: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('ACTIVE'),
  reason: z.string().max(250).optional(),
});

export type UpsertPricingRuleInput = z.infer<typeof UpsertPricingRuleInputSchema>;

export interface EffectivePriceResult {
  effectivePriceMinor: number;
  currency: string;
  pricingLevel: PricingLevel;
  sourceRuleId?: string;
  mrpMinor: number;
  costPriceMinor?: number; // Redacted for Cashier
  sellingPriceMinor: number;
  wholesalePriceMinor?: number;
  minimumSellingPriceMinor?: number;
  appliedOverride: boolean;
}

export interface PricingHistoryDocument {
  id: string;
  organizationId: string;
  productId: string;
  variantId?: string | null;
  oldPricing: VariantPricing;
  newPricing: VariantPricing;
  changeType: 'MANUAL_EDIT' | 'BULK_UPDATE' | 'STORE_OVERRIDE' | 'PROMOTION';
  reason?: string;
  performedByUserId: string;
  performedByUserEmail?: string;
  createdAt: string;
}
