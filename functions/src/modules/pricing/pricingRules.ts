import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { firestore } from 'firebase-admin';
import { db } from '../../config/firebase';
import { requireMembership, requireRole } from '../../middleware/auth';
import {
  ValidationError,
  NotFoundError,
  handleFunctionError,
} from '../../shared/errors';
import {
  UpsertPricingRuleInputSchema,
  GetEffectivePriceInputSchema,
  CalculateTaxCallableInputSchema,
  type UpsertPricingRuleInput,
  type GetEffectivePriceInput,
  type CalculateTaxCallableInput,
} from '../../schemas/pricing';
import { calculateTax } from '../../shared/tax';

const PRICING_ADMIN_ROLES = ['OWNER', 'MANAGER'] as const;

/**
 * 1. Creates or updates a pricing rule (Store override, Customer Group, or Customer specific).
 */
export const upsertPricingRule = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<UpsertPricingRuleInput>) => {
    try {
      const parseResult = UpsertPricingRuleInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid pricing rule: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const input = parseResult.data;
      const { organizationId } = input;
      await requireRole(request, organizationId, [...PRICING_ADMIN_ROLES]);

      // Verify product exists in organization
      const productRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('products')
        .doc(input.productId);

      const productDoc = await productRef.get();
      if (!productDoc.exists) {
        throw new NotFoundError(`Product '${input.productId}' does not exist in this organization`);
      }

      // If variantId specified, verify variant exists
      if (input.variantId) {
        const variantDoc = await productRef.collection('variants').doc(input.variantId).get();
        if (!variantDoc.exists) {
          throw new NotFoundError(`Variant '${input.variantId}' does not exist under product '${input.productId}'`);
        }
      }

      const rulesColRef = db.collection('organizations').doc(organizationId).collection('pricingRules');
      const ruleId = input.id || rulesColRef.doc().id;
      const ruleRef = rulesColRef.doc(ruleId);
      const now = firestore.Timestamp.now();

      const ruleData = {
        id: ruleId,
        organizationId,
        level: input.level,
        targetEntityId: input.targetEntityId,
        productId: input.productId,
        variantId: input.variantId || null,
        priceMinor: input.priceMinor,
        currency: input.currency || 'INR',
        effectiveStartDate: input.effectiveStartDate,
        effectiveEndDate: input.effectiveEndDate || null,
        status: input.status,
        reason: input.reason || null,
        updatedAt: now,
        createdAt: now,
      };

      await ruleRef.set(ruleData, { merge: true });

      return {
        success: true,
        pricingRuleId: ruleId,
        message: 'Pricing rule saved successfully',
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * 2. Archives a pricing rule.
 */
export const archivePricingRule = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<{ organizationId: string; pricingRuleId: string }>) => {
    try {
      const { organizationId, pricingRuleId } = request.data || {};
      if (!organizationId || !pricingRuleId) {
        throw new ValidationError('organizationId and pricingRuleId are required');
      }

      await requireRole(request, organizationId, [...PRICING_ADMIN_ROLES]);

      const ruleRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('pricingRules')
        .doc(pricingRuleId);

      const ruleDoc = await ruleRef.get();
      if (!ruleDoc.exists) {
        throw new NotFoundError(`Pricing rule '${pricingRuleId}' not found`);
      }

      const now = firestore.Timestamp.now();
      await ruleRef.update({
        status: 'ARCHIVED',
        updatedAt: now,
      });

      return {
        success: true,
        pricingRuleId,
        message: 'Pricing rule archived successfully',
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * 3. Evaluates the hierarchical pricing precedence:
 * Customer -> Customer Group -> Store Override -> Variant Price -> Product Default.
 * Redacts cost price if caller is CASHIER.
 */
export const getEffectivePrice = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<GetEffectivePriceInput>) => {
    try {
      const parseResult = GetEffectivePriceInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid input: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const {
        organizationId,
        productId,
        variantId,
        storeId,
        customerId,
        customerGroupId,
        atTimestamp,
      } = parseResult.data;

      // Authoritative membership check (any active member: CASHIER, MANAGER, OWNER, etc.)
      const { membership } = await requireMembership(request, organizationId);

      const evalTime = atTimestamp ? new Date(atTimestamp).getTime() : Date.now();

      // Fetch Product document
      const productRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('products')
        .doc(productId);

      const productDoc = await productRef.get();
      if (!productDoc.exists) {
        throw new NotFoundError(`Product '${productId}' not found`);
      }
      const productData = productDoc.data()!;

      // Fetch Variant document if specified
      let variantData: any = null;
      if (variantId) {
        const variantDoc = await productRef.collection('variants').doc(variantId).get();
        if (variantDoc.exists) {
          variantData = variantDoc.data();
        }
      }

      // Base Catalog Pricing
      const mrpMinor = variantData?.pricing?.mrp ?? 0;
      const costPriceMinor = variantData?.pricing?.costPrice ?? 0;
      const sellingPriceMinor = variantData?.pricing?.sellingPrice ?? 0;
      const wholesalePriceMinor = variantData?.pricing?.wholesalePrice;
      const minimumSellingPriceMinor = variantData?.pricing?.minimumSellingPrice;

      // Query active pricing rules for this product
      const rulesQuery = db
        .collection('organizations')
        .doc(organizationId)
        .collection('pricingRules')
        .where('productId', '==', productId)
        .where('status', '==', 'ACTIVE');

      const rulesSnap = await rulesQuery.get();
      const rules = rulesSnap.docs.map((d) => d.data());

      // Filter by effective date
      const activeRules = rules.filter((r) => {
        const start = new Date(r.effectiveStartDate).getTime();
        const end = r.effectiveEndDate ? new Date(r.effectiveEndDate).getTime() : Infinity;
        return evalTime >= start && evalTime <= end;
      });

      // Filter by variant matching (rule variant matches, or rule applies to whole product)
      const matchingRules = activeRules.filter(
        (r) => !r.variantId || r.variantId === variantId
      );

      let effectivePriceMinor = sellingPriceMinor;
      let pricingLevel: 'ORGANIZATION' | 'STORE' | 'PRODUCT' | 'VARIANT' | 'CUSTOMER_GROUP' | 'CUSTOMER' = variantData
        ? 'VARIANT'
        : 'PRODUCT';
      let sourceRuleId: string | undefined = undefined;
      let appliedOverride = false;

      // Precedence 1: Customer-Specific Override
      if (customerId) {
        const customerRule = matchingRules.find(
          (r) => r.level === 'CUSTOMER' && r.targetEntityId === customerId
        );
        if (customerRule) {
          effectivePriceMinor = customerRule.priceMinor;
          pricingLevel = 'CUSTOMER';
          sourceRuleId = customerRule.id;
          appliedOverride = true;
        }
      }

      // Precedence 2: Customer-Group Tier
      if (!appliedOverride && customerGroupId) {
        const groupRule = matchingRules.find(
          (r) => r.level === 'CUSTOMER_GROUP' && r.targetEntityId === customerGroupId
        );
        if (groupRule) {
          effectivePriceMinor = groupRule.priceMinor;
          pricingLevel = 'CUSTOMER_GROUP';
          sourceRuleId = groupRule.id;
          appliedOverride = true;
        }
      }

      // Precedence 3: Store-Level Branch Override
      if (!appliedOverride && storeId) {
        const storeRule = matchingRules.find(
          (r) => r.level === 'STORE' && r.targetEntityId === storeId
        );
        if (storeRule) {
          effectivePriceMinor = storeRule.priceMinor;
          pricingLevel = 'STORE';
          sourceRuleId = storeRule.id;
          appliedOverride = true;
        }
      }

      // Cost price visibility restriction:
      // Redact cost price if caller holds CASHIER role without explicit accounting permissions
      const isCashierRole = membership.role === 'CASHIER';

      return {
        success: true,
        productId,
        variantId: variantId || null,
        productName: productData.name,
        currency: 'INR',
        effectivePriceMinor,
        pricingLevel,
        sourceRuleId,
        appliedOverride,
        mrpMinor,
        costPriceMinor: isCashierRole ? undefined : costPriceMinor,
        sellingPriceMinor,
        wholesalePriceMinor,
        minimumSellingPriceMinor,
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * 4. Callable endpoint for calculating GST and tax components.
 */
export const calculateTaxEndpoint = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<CalculateTaxCallableInput>) => {
    try {
      const parseResult = CalculateTaxCallableInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid tax calculation payload: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const { organizationId, ...params } = parseResult.data;
      await requireMembership(request, organizationId);

      const result = calculateTax(params);
      return {
        success: true,
        calculation: result,
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);
