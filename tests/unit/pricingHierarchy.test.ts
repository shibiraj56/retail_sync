import { describe, it, expect } from 'vitest';

interface PricingRule {
  id: string;
  level: 'CUSTOMER' | 'CUSTOMER_GROUP' | 'STORE' | 'ORGANIZATION';
  targetEntityId: string;
  productId: string;
  variantId?: string | null;
  priceMinor: number;
  effectiveStartDate: string;
  effectiveEndDate?: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
}

interface ResolveEffectivePriceParams {
  productId: string;
  variantId?: string;
  baseVariantPriceMinor: number;
  mrpMinor: number;
  costPriceMinor?: number;
  rules: PricingRule[];
  storeId?: string;
  customerId?: string;
  customerGroupId?: string;
  callerRole: 'OWNER' | 'MANAGER' | 'CASHIER' | 'OPERATOR';
  atTimestamp?: string;
}

/**
 * Pure evaluator representing the 6-tier pricing hierarchy engine:
 * 1. CUSTOMER
 * 2. CUSTOMER_GROUP
 * 3. STORE
 * 4. VARIANT
 * 5. PRODUCT
 * 6. ORGANIZATION
 */
function resolveEffectivePrice(params: ResolveEffectivePriceParams) {
  const evalTime = params.atTimestamp ? new Date(params.atTimestamp).getTime() : Date.now();

  // 1. Filter active rules within effective date range
  const activeRules = params.rules.filter((r) => {
    if (r.status !== 'ACTIVE' || r.productId !== params.productId) return false;
    const start = new Date(r.effectiveStartDate).getTime();
    const end = r.effectiveEndDate ? new Date(r.effectiveEndDate).getTime() : Infinity;
    return evalTime >= start && evalTime <= end;
  });

  // 2. Filter variant match (rule has matching variantId or is applicable to all variants)
  const matchingRules = activeRules.filter(
    (r) => !r.variantId || r.variantId === params.variantId
  );

  let effectivePriceMinor = params.baseVariantPriceMinor;
  let pricingLevel: 'CUSTOMER' | 'CUSTOMER_GROUP' | 'STORE' | 'VARIANT' | 'PRODUCT' | 'ORGANIZATION' = params.variantId
    ? 'VARIANT'
    : 'PRODUCT';
  let sourceRuleId: string | undefined = undefined;
  let appliedOverride = false;

  // Precedence 1: Customer Override
  if (params.customerId) {
    const customerRule = matchingRules.find(
      (r) => r.level === 'CUSTOMER' && r.targetEntityId === params.customerId
    );
    if (customerRule) {
      effectivePriceMinor = customerRule.priceMinor;
      pricingLevel = 'CUSTOMER';
      sourceRuleId = customerRule.id;
      appliedOverride = true;
    }
  }

  // Precedence 2: Customer Group Tier
  if (!appliedOverride && params.customerGroupId) {
    const groupRule = matchingRules.find(
      (r) => r.level === 'CUSTOMER_GROUP' && r.targetEntityId === params.customerGroupId
    );
    if (groupRule) {
      effectivePriceMinor = groupRule.priceMinor;
      pricingLevel = 'CUSTOMER_GROUP';
      sourceRuleId = groupRule.id;
      appliedOverride = true;
    }
  }

  // Precedence 3: Store-Level Branch Override
  if (!appliedOverride && params.storeId) {
    const storeRule = matchingRules.find(
      (r) => r.level === 'STORE' && r.targetEntityId === params.storeId
    );
    if (storeRule) {
      effectivePriceMinor = storeRule.priceMinor;
      pricingLevel = 'STORE';
      sourceRuleId = storeRule.id;
      appliedOverride = true;
    }
  }

  // Cashier role redaction check
  const isCashierRole = params.callerRole === 'CASHIER';

  return {
    effectivePriceMinor,
    mrpMinor: params.mrpMinor,
    costPriceMinor: isCashierRole ? undefined : params.costPriceMinor,
    appliedOverride,
    pricingLevel,
    sourceRuleId,
  };
}

describe('Pricing Hierarchy Precedence Engine', () => {
  const baseRules: PricingRule[] = [
    {
      id: 'rule_store_nashik',
      level: 'STORE',
      targetEntityId: 'store_nashik',
      productId: 'prod_100',
      variantId: 'var_100_s',
      priceMinor: 9500, // ₹95.00
      effectiveStartDate: '2026-01-01T00:00:00Z',
      effectiveEndDate: '2026-12-31T23:59:59Z',
      status: 'ACTIVE',
    },
    {
      id: 'rule_vip_group',
      level: 'CUSTOMER_GROUP',
      targetEntityId: 'group_vip',
      productId: 'prod_100',
      variantId: 'var_100_s',
      priceMinor: 9000, // ₹90.00
      effectiveStartDate: '2026-01-01T00:00:00Z',
      effectiveEndDate: '2026-12-31T23:59:59Z',
      status: 'ACTIVE',
    },
    {
      id: 'rule_special_customer',
      level: 'CUSTOMER',
      targetEntityId: 'cust_acme_corp',
      productId: 'prod_100',
      variantId: 'var_100_s',
      priceMinor: 8500, // ₹85.00
      effectiveStartDate: '2026-01-01T00:00:00Z',
      effectiveEndDate: '2026-12-31T23:59:59Z',
      status: 'ACTIVE',
    },
  ];

  it('resolves Tier 1 Customer Override over Customer Group, Store, and Variant defaults', () => {
    const result = resolveEffectivePrice({
      productId: 'prod_100',
      variantId: 'var_100_s',
      baseVariantPriceMinor: 10000, // Default ₹100.00
      mrpMinor: 12000,
      costPriceMinor: 7000,
      rules: baseRules,
      storeId: 'store_nashik',
      customerGroupId: 'group_vip',
      customerId: 'cust_acme_corp',
      callerRole: 'MANAGER',
      atTimestamp: '2026-06-01T12:00:00Z',
    });

    expect(result.pricingLevel).toBe('CUSTOMER');
    expect(result.effectivePriceMinor).toBe(8500); // Customer price wins
    expect(result.sourceRuleId).toBe('rule_special_customer');
    expect(result.appliedOverride).toBe(true);
    expect(result.costPriceMinor).toBe(7000); // Manager sees cost price
  });

  it('resolves Tier 2 Customer Group when Customer Override is absent', () => {
    const result = resolveEffectivePrice({
      productId: 'prod_100',
      variantId: 'var_100_s',
      baseVariantPriceMinor: 10000,
      mrpMinor: 12000,
      costPriceMinor: 7000,
      rules: baseRules,
      storeId: 'store_nashik',
      customerGroupId: 'group_vip',
      callerRole: 'OWNER',
      atTimestamp: '2026-06-01T12:00:00Z',
    });

    expect(result.pricingLevel).toBe('CUSTOMER_GROUP');
    expect(result.effectivePriceMinor).toBe(9000); // VIP Group price wins over Store
    expect(result.sourceRuleId).toBe('rule_vip_group');
    expect(result.appliedOverride).toBe(true);
  });

  it('resolves Tier 3 Store Override when customer and group rules are absent', () => {
    const result = resolveEffectivePrice({
      productId: 'prod_100',
      variantId: 'var_100_s',
      baseVariantPriceMinor: 10000,
      mrpMinor: 12000,
      costPriceMinor: 7000,
      rules: baseRules,
      storeId: 'store_nashik',
      callerRole: 'MANAGER',
      atTimestamp: '2026-06-01T12:00:00Z',
    });

    expect(result.pricingLevel).toBe('STORE');
    expect(result.effectivePriceMinor).toBe(9500); // Store price wins over Variant base
    expect(result.sourceRuleId).toBe('rule_store_nashik');
    expect(result.appliedOverride).toBe(true);
  });

  it('falls back to Tier 4 Variant Base Price when no higher overrides match', () => {
    const result = resolveEffectivePrice({
      productId: 'prod_100',
      variantId: 'var_100_s',
      baseVariantPriceMinor: 10000,
      mrpMinor: 12000,
      costPriceMinor: 7000,
      rules: baseRules,
      storeId: 'store_mumbai', // Different store without override
      callerRole: 'MANAGER',
      atTimestamp: '2026-06-01T12:00:00Z',
    });

    expect(result.pricingLevel).toBe('VARIANT');
    expect(result.effectivePriceMinor).toBe(10000); // Variant base price
    expect(result.sourceRuleId).toBeUndefined();
    expect(result.appliedOverride).toBe(false);
  });

  it('ignores expired or scheduled future rules outside the active date window', () => {
    const expiredRules: PricingRule[] = [
      {
        id: 'rule_promo_2025',
        level: 'STORE',
        targetEntityId: 'store_nashik',
        productId: 'prod_100',
        variantId: 'var_100_s',
        priceMinor: 5000,
        effectiveStartDate: '2025-01-01T00:00:00Z',
        effectiveEndDate: '2025-01-31T23:59:59Z',
        status: 'ACTIVE',
      },
    ];

    const result = resolveEffectivePrice({
      productId: 'prod_100',
      variantId: 'var_100_s',
      baseVariantPriceMinor: 10000,
      mrpMinor: 12000,
      costPriceMinor: 7000,
      rules: expiredRules,
      storeId: 'store_nashik',
      callerRole: 'MANAGER',
      atTimestamp: '2026-06-01T12:00:00Z', // 2026 is after 2025 promo
    });

    expect(result.pricingLevel).toBe('VARIANT');
    expect(result.effectivePriceMinor).toBe(10000);
    expect(result.appliedOverride).toBe(false);
  });

  it('redacts costPrice for CASHIER role to protect business gross margins', () => {
    const cashierResult = resolveEffectivePrice({
      productId: 'prod_100',
      variantId: 'var_100_s',
      baseVariantPriceMinor: 10000,
      mrpMinor: 12000,
      costPriceMinor: 7000,
      rules: baseRules,
      callerRole: 'CASHIER',
    });

    expect(cashierResult.costPriceMinor).toBeUndefined(); // Redacted!

    const managerResult = resolveEffectivePrice({
      productId: 'prod_100',
      variantId: 'var_100_s',
      baseVariantPriceMinor: 10000,
      mrpMinor: 12000,
      costPriceMinor: 7000,
      rules: baseRules,
      callerRole: 'MANAGER',
    });

    expect(managerResult.costPriceMinor).toBe(7000); // Visible to manager
  });
});
