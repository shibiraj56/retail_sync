import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db, functions } from '../config/firebase';
import type {
  TaxConfigurationDocument,
  UpsertTaxConfigurationInput,
  PricingRuleDocument,
  UpsertPricingRuleInput,
  EffectivePriceResult,
  PricingHistoryDocument,
} from '../types/pricing';
import type { VariantPricing } from '../types/variants';
import type { TaxCalculationResult, TaxCalculationInput } from '../lib/tax';

// ============================================================================
// 1. TAX CONFIGURATION SERVICE
// ============================================================================

export async function fetchTaxConfigurations(
  organizationId: string
): Promise<TaxConfigurationDocument[]> {
  const colRef = collection(db, 'organizations', organizationId, 'taxConfigurations');
  const q = query(colRef, orderBy('ratePercent', 'asc'));
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      id: d.id,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
    } as TaxConfigurationDocument;
  });
}

export async function saveTaxConfiguration(
  input: UpsertTaxConfigurationInput
): Promise<{ taxConfigurationId: string }> {
  const callFn = httpsCallable<UpsertTaxConfigurationInput, { success: boolean; taxConfigurationId: string }>(
    functions,
    'upsertTaxConfiguration'
  );
  const result = await callFn(input);
  return { taxConfigurationId: result.data.taxConfigurationId };
}

export async function seedDefaultTaxConfigurations(
  organizationId: string
): Promise<{ seededCount: number }> {
  const callFn = httpsCallable<{ organizationId: string }, { success: boolean; seededCount: number }>(
    functions,
    'seedDefaultTaxConfigurations'
  );
  const result = await callFn({ organizationId });
  return { seededCount: result.data.seededCount };
}

export async function archiveTaxConfiguration(
  organizationId: string,
  taxConfigurationId: string
): Promise<void> {
  const callFn = httpsCallable<{ organizationId: string; taxConfigurationId: string }, { success: boolean }>(
    functions,
    'archiveTaxConfiguration'
  );
  await callFn({ organizationId, taxConfigurationId });
}

// ============================================================================
// 2. PRICING RULES & HIERARCHY SERVICE
// ============================================================================

export async function fetchPricingRules(
  organizationId: string,
  productId?: string
): Promise<PricingRuleDocument[]> {
  const colRef = collection(db, 'organizations', organizationId, 'pricingRules');
  let q = query(colRef, orderBy('createdAt', 'desc'));

  if (productId) {
    q = query(colRef, where('productId', '==', productId), orderBy('createdAt', 'desc'));
  }

  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      id: d.id,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
    } as PricingRuleDocument;
  });
}

export async function savePricingRule(
  input: UpsertPricingRuleInput
): Promise<{ pricingRuleId: string }> {
  const callFn = httpsCallable<UpsertPricingRuleInput, { success: boolean; pricingRuleId: string }>(
    functions,
    'upsertPricingRule'
  );
  const result = await callFn(input);
  return { pricingRuleId: result.data.pricingRuleId };
}

export async function archivePricingRule(
  organizationId: string,
  pricingRuleId: string
): Promise<void> {
  const callFn = httpsCallable<{ organizationId: string; pricingRuleId: string }, { success: boolean }>(
    functions,
    'archivePricingRule'
  );
  await callFn({ organizationId, pricingRuleId });
}

export async function getEffectivePrice(params: {
  organizationId: string;
  productId: string;
  variantId?: string;
  storeId?: string;
  customerId?: string;
  customerGroupId?: string;
  atTimestamp?: string;
}): Promise<EffectivePriceResult> {
  const callFn = httpsCallable<any, { success: boolean } & EffectivePriceResult>(
    functions,
    'getEffectivePrice'
  );
  const result = await callFn(params);
  return result.data;
}

export async function calculateTaxRemote(
  params: TaxCalculationInput & { organizationId: string }
): Promise<TaxCalculationResult> {
  const callFn = httpsCallable<any, { success: boolean; calculation: TaxCalculationResult }>(
    functions,
    'calculateTaxEndpoint'
  );
  const result = await callFn(params);
  return result.data.calculation;
}

// ============================================================================
// 3. VARIANT PRICING & BULK UPDATE SERVICE
// ============================================================================

export async function updateVariantPricing(params: {
  organizationId: string;
  productId: string;
  variantId: string;
  pricing: VariantPricing;
  reason?: string;
}): Promise<void> {
  const callFn = httpsCallable<any, { success: boolean }>(functions, 'updateVariantPricing');
  await callFn(params);
}

export async function bulkUpdateVariantPricing(params: {
  organizationId: string;
  productId: string;
  updates: Array<{ variantId: string; pricing: VariantPricing }>;
  reason?: string;
}): Promise<{ updatedCount: number }> {
  const callFn = httpsCallable<any, { success: boolean; updatedCount: number }>(
    functions,
    'bulkUpdateVariantPricing'
  );
  const result = await callFn(params);
  return { updatedCount: result.data.updatedCount };
}

export async function fetchPricingHistory(
  organizationId: string,
  productId: string,
  variantId?: string
): Promise<PricingHistoryDocument[]> {
  const callFn = httpsCallable<any, { success: boolean; history: PricingHistoryDocument[] }>(
    functions,
    'getPricingHistory'
  );
  const result = await callFn({ organizationId, productId, variantId });
  return result.data.history;
}
