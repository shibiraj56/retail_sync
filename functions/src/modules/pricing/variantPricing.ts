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
  BulkUpdateVariantPricingInputSchema,
  type BulkUpdateVariantPricingInput,
} from '../../schemas/pricing';
import { VariantPricingSchema, type VariantPricing } from '../../schemas/variants';
import { validatePriceRelationship } from '../../shared/money';

const PRICING_ADMIN_ROLES = ['OWNER', 'MANAGER'] as const;

/**
 * 1. Updates pricing for a single variant with validation and immutable audit history.
 */
export const updateVariantPricing = onCall(
  { region: 'asia-south1' },
  async (
    request: CallableRequest<{
      organizationId: string;
      productId: string;
      variantId: string;
      pricing: VariantPricing;
      reason?: string;
    }>
  ) => {
    try {
      const { organizationId, productId, variantId, pricing, reason } = request.data || {};
      if (!organizationId || !productId || !variantId || !pricing) {
        throw new ValidationError('organizationId, productId, variantId, and pricing are required');
      }

      const { user } = await requireRole(request, organizationId, [...PRICING_ADMIN_ROLES]);

      const parsedPricing = VariantPricingSchema.safeParse(pricing);
      if (!parsedPricing.success) {
        throw new ValidationError(
          `Invalid pricing payload: ${parsedPricing.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const priceValidation = validatePriceRelationship(parsedPricing.data);
      if (!priceValidation.valid) {
        throw new ValidationError(priceValidation.error || 'Invalid price relationship');
      }

      const variantRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('products')
        .doc(productId)
        .collection('variants')
        .doc(variantId);

      const historyColRef = db.collection('organizations').doc(organizationId).collection('pricingHistory');

      const now = firestore.Timestamp.now();

      await db.runTransaction(async (transaction) => {
        const variantDoc = await transaction.get(variantRef);
        if (!variantDoc.exists) {
          throw new NotFoundError(`Variant '${variantId}' not found under product '${productId}'`);
        }

        const oldData = variantDoc.data()!;
        if (oldData.status === 'ARCHIVED') {
          throw new ValidationError('Cannot modify pricing of an archived variant');
        }

        const oldPricing = oldData.pricing || {
          mrp: 0,
          sellingPrice: 0,
          costPrice: 0,
        };

        // 1. Update variant document
        transaction.update(variantRef, {
          pricing: parsedPricing.data,
          updatedAt: now,
        });

        // 2. Write immutable pricing audit history entry
        const historyId = historyColRef.doc().id;
        transaction.set(historyColRef.doc(historyId), {
          id: historyId,
          organizationId,
          productId,
          variantId,
          oldPricing,
          newPricing: parsedPricing.data,
          changeType: 'MANUAL_EDIT',
          reason: reason || null,
          performedByUserId: user.uid,
          performedByUserEmail: user.email,
          createdAt: now,
        });
      });

      return {
        success: true,
        variantId,
        message: 'Variant pricing updated and history logged successfully',
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * 2. Bounded bulk pricing updates for multiple variants (up to 50 items).
 */
export const bulkUpdateVariantPricing = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<BulkUpdateVariantPricingInput>) => {
    try {
      const parseResult = BulkUpdateVariantPricingInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid bulk pricing payload: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const { organizationId, productId, updates, reason } = parseResult.data;
      const { user } = await requireRole(request, organizationId, [...PRICING_ADMIN_ROLES]);

      // Preflight validate price relationships for all items
      for (const item of updates) {
        const val = validatePriceRelationship(item.pricing);
        if (!val.valid) {
          throw new ValidationError(`Variant '${item.variantId}': ${val.error}`);
        }
      }

      const productRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('products')
        .doc(productId);

      const variantsColRef = productRef.collection('variants');
      const historyColRef = db.collection('organizations').doc(organizationId).collection('pricingHistory');
      const now = firestore.Timestamp.now();

      await db.runTransaction(async (transaction) => {
        // Read product
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists) {
          throw new NotFoundError(`Product '${productId}' not found`);
        }

        // Read all target variants
        const variantRefs = updates.map((u) => variantsColRef.doc(u.variantId));
        const variantDocs = await Promise.all(variantRefs.map((ref) => transaction.get(ref)));

        for (let i = 0; i < variantDocs.length; i++) {
          const docSnap = variantDocs[i];
          const updateItem = updates[i];
          if (!docSnap.exists) {
            throw new NotFoundError(`Variant '${updateItem.variantId}' not found`);
          }
          const oldData = docSnap.data()!;
          if (oldData.status === 'ARCHIVED') {
            throw new ValidationError(`Variant '${updateItem.variantId}' is archived`);
          }

          const oldPricing = oldData.pricing || { mrp: 0, sellingPrice: 0, costPrice: 0 };

          // Update variant pricing
          transaction.update(docSnap.ref, {
            pricing: updateItem.pricing,
            updatedAt: now,
          });

          // Log audit entry
          const historyId = historyColRef.doc().id;
          transaction.set(historyColRef.doc(historyId), {
            id: historyId,
            organizationId,
            productId,
            variantId: updateItem.variantId,
            oldPricing,
            newPricing: updateItem.pricing,
            changeType: 'BULK_UPDATE',
            reason: reason || 'Bulk Price Update',
            performedByUserId: user.uid,
            performedByUserEmail: user.email,
            createdAt: now,
          });
        }
      });

      return {
        success: true,
        updatedCount: updates.length,
        message: `Successfully updated pricing for ${updates.length} variants`,
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * 3. Retrieves immutable pricing audit history for a product or variant.
 */
export const getPricingHistory = onCall(
  { region: 'asia-south1' },
  async (
    request: CallableRequest<{
      organizationId: string;
      productId: string;
      variantId?: string;
    }>
  ) => {
    try {
      const { organizationId, productId, variantId } = request.data || {};
      if (!organizationId || !productId) {
        throw new ValidationError('organizationId and productId are required');
      }

      await requireMembership(request, organizationId);

      let historyQuery = db
        .collection('organizations')
        .doc(organizationId)
        .collection('pricingHistory')
        .where('productId', '==', productId);

      if (variantId) {
        historyQuery = historyQuery.where('variantId', '==', variantId);
      }

      const snap = await historyQuery.get();
      const history = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        };
      });

      // Sort in-memory desc by createdAt
      history.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

      return {
        success: true,
        history,
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);
