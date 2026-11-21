import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { firestore } from 'firebase-admin';
import { db } from '../../config/firebase';
import { requireRole } from '../../middleware/auth';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  handleFunctionError,
} from '../../shared/errors';
import {
  UpsertProductInputSchema,
  type UpsertProductInput,
} from '../../schemas/catalog';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Creates or updates a Master Product document inside an organization.
 * Validates:
 * 1. Product code uniqueness via `/codeRegistry/PRODUCT_{code}` inside runTransaction.
 * 2. Active status and existence of Category, Brand, Base UoM and Secondary UoM.
 * 3. UoM compatibility and positive conversion factor.
 * 4. Preserves category, brand, and UoM snapshots to prevent breaking on reference updates.
 */
export const upsertMasterProduct = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<UpsertProductInput>) => {
    try {
      const parseResult = UpsertProductInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid product payload: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const input = parseResult.data;
      const { organizationId } = input;

      // Authoritative RBAC assertion: Only OWNER or MANAGER can mutate catalog records
      await requireRole(request, organizationId, ['OWNER', 'MANAGER']);

      const normalizedCode = input.code.toUpperCase();
      const codeRegistryDocId = `PRODUCT_${normalizedCode}`;
      const codeRegistryRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('codeRegistry')
        .doc(codeRegistryDocId);

      const productId = input.id || db.collection('organizations').doc(organizationId).collection('products').doc().id;
      const productRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('products')
        .doc(productId);

      // Foreign reference references
      const categoryRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('categories')
        .doc(input.categoryId);

      const brandRef = input.brandId
        ? db.collection('organizations').doc(organizationId).collection('brands').doc(input.brandId)
        : null;

      const baseUomRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('unitsOfMeasure')
        .doc(input.baseUomId);

      const secondaryUomRef = input.secondaryUomId
        ? db.collection('organizations').doc(organizationId).collection('unitsOfMeasure').doc(input.secondaryUomId)
        : null;

      await db.runTransaction(async (transaction) => {
        // ====================================================================
        // 1. ALL READS FIRST (Strict Firestore Transaction Sequencing)
        // ====================================================================

        // A. Product Code Registry Uniqueness
        const codeRegDoc = await transaction.get(codeRegistryRef);
        if (codeRegDoc.exists) {
          const regData = codeRegDoc.data();
          if (regData && regData.targetDocumentId !== productId) {
            throw new ConflictError(
              `Product code '${normalizedCode}' is already registered to another product in this organization`
            );
          }
        }

        // B. Existing Product Check
        const existingProductDoc = await transaction.get(productRef);
        let oldCode: string | null = null;
        if (existingProductDoc.exists) {
          const oldData = existingProductDoc.data();
          oldCode = oldData?.code ? oldData.code.toUpperCase() : null;
        }

        let oldCodeRegistryRef: firestore.DocumentReference | null = null;
        if (oldCode && oldCode !== normalizedCode) {
          oldCodeRegistryRef = db
            .collection('organizations')
            .doc(organizationId)
            .collection('codeRegistry')
            .doc(`PRODUCT_${oldCode}`);
        }

        // C. Category Existence & Active Validation
        const categoryDoc = await transaction.get(categoryRef);
        if (!categoryDoc.exists) {
          throw new NotFoundError(`Category '${input.categoryId}' does not exist in this organization`);
        }
        const categoryData = categoryDoc.data();
        if (!categoryData || categoryData.status === 'ARCHIVED') {
          throw new ValidationError(`Referenced Category '${input.categoryId}' is archived and cannot be assigned`);
        }

        // D. Brand Existence & Active Validation (if provided)
        let brandSnapshot: { name: string; code: string } | null = null;
        if (brandRef) {
          const brandDoc = await transaction.get(brandRef);
          if (!brandDoc.exists) {
            throw new NotFoundError(`Brand '${input.brandId}' does not exist in this organization`);
          }
          const brandData = brandDoc.data();
          if (!brandData || brandData.status === 'ARCHIVED') {
            throw new ValidationError(`Referenced Brand '${input.brandId}' is archived and cannot be assigned`);
          }
          brandSnapshot = {
            name: brandData.name,
            code: brandData.code,
          };
        }

        // E. Base UoM Existence & Active Validation
        const baseUomDoc = await transaction.get(baseUomRef);
        if (!baseUomDoc.exists) {
          throw new NotFoundError(`Base Unit of Measure '${input.baseUomId}' does not exist in this organization`);
        }
        const baseUomData = baseUomDoc.data();
        if (!baseUomData || baseUomData.status === 'ARCHIVED') {
          throw new ValidationError(`Referenced Base UoM '${input.baseUomId}' is archived and cannot be assigned`);
        }

        // F. Secondary UoM Existence & Compatibility Validation (if provided)
        let secondaryUomSnapshot: {
          name: string;
          symbol: string;
          allowDecimals: boolean;
          decimalPrecision: number;
        } | null = null;

        if (secondaryUomRef) {
          const secUomDoc = await transaction.get(secondaryUomRef);
          if (!secUomDoc.exists) {
            throw new NotFoundError(`Secondary Unit of Measure '${input.secondaryUomId}' does not exist in this organization`);
          }
          const secUomData = secUomDoc.data();
          if (!secUomData || secUomData.status === 'ARCHIVED') {
            throw new ValidationError(`Referenced Secondary UoM '${input.secondaryUomId}' is archived`);
          }

          // Dimension Compatibility Check
          if (baseUomData.type !== secUomData.type && secUomData.type !== 'COUNT') {
            throw new ValidationError(
              `Secondary unit '${secUomData.symbol}' (${secUomData.type}) is dimensionally incompatible with base unit '${baseUomData.symbol}' (${baseUomData.type})`
            );
          }

          secondaryUomSnapshot = {
            name: secUomData.name,
            symbol: secUomData.symbol,
            allowDecimals: secUomData.allowDecimals,
            decimalPrecision: secUomData.decimalPrecision,
          };
        }

        // ====================================================================
        // 2. ALL WRITES SECOND
        // ====================================================================
        const now = firestore.Timestamp.now();
        const slug = `${slugify(input.name)}-${normalizedCode.toLowerCase()}`;

        // Preserve old code registry as RESERVED_ARCHIVED per audit policy
        if (oldCodeRegistryRef) {
          transaction.set(
            oldCodeRegistryRef,
            {
              status: 'RESERVED_ARCHIVED',
              supersededBy: normalizedCode,
              updatedAt: now,
            },
            { merge: true }
          );
        }

        // Write new code registry reservation
        transaction.set(codeRegistryRef, {
          id: codeRegistryDocId,
          organizationId,
          entityType: 'PRODUCT',
          targetDocumentId: productId,
          status: input.status,
          createdAt: existingProductDoc.exists ? (existingProductDoc.data()?.createdAt || now) : now,
          updatedAt: now,
        });

        // Set Product Document
        const productData = {
          id: productId,
          organizationId,
          name: input.name,
          code: normalizedCode,
          slug,
          description: input.description || null,
          categoryId: input.categoryId,
          categorySnapshot: {
            name: categoryData.name,
            code: categoryData.code,
          },
          brandId: input.brandId || null,
          brandSnapshot,
          baseUomId: input.baseUomId,
          baseUomSnapshot: {
            name: baseUomData.name,
            symbol: baseUomData.symbol,
            allowDecimals: baseUomData.allowDecimals,
            decimalPrecision: baseUomData.decimalPrecision,
          },
          secondaryUomId: input.secondaryUomId || null,
          secondaryUomSnapshot,
          uomConversionFactor: input.uomConversionFactor || null,
          hasVariants: existingProductDoc.exists ? (existingProductDoc.data()?.hasVariants || false) : false,
          taxData: input.taxData,
          pricingPolicy: input.pricingPolicy,
          trackingFlags: input.trackingFlags,
          images: input.images || [],
          status: input.status,
          createdAt: existingProductDoc.exists ? (existingProductDoc.data()?.createdAt || now) : now,
          updatedAt: now,
        };

        transaction.set(productRef, productData, { merge: true });
      });

      return {
        success: true,
        productId,
        message: 'Product master saved successfully',
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * Soft-archives a product.
 * Cascades status: "ARCHIVED" to product and marks code registry as "RESERVED_ARCHIVED".
 * Never permanently deletes products.
 */
export const archiveProduct = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<{ organizationId: string; productId: string }>) => {
    try {
      const { organizationId, productId } = request.data || {};
      if (!organizationId || !productId) {
        throw new ValidationError('organizationId and productId are required');
      }

      await requireRole(request, organizationId, ['OWNER', 'MANAGER']);

      const productRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('products')
        .doc(productId);

      await db.runTransaction(async (transaction) => {
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists) {
          throw new NotFoundError('Product not found');
        }

        const productData = productDoc.data();
        if (!productData) {
          throw new NotFoundError('Product data is empty');
        }

        const now = firestore.Timestamp.now();

        // 1. Soft-archive product
        transaction.update(productRef, {
          status: 'ARCHIVED',
          updatedAt: now,
        });

        // 2. Mark code registry entry as RESERVED_ARCHIVED
        if (productData.code) {
          const codeRegRef = db
            .collection('organizations')
            .doc(organizationId)
            .collection('codeRegistry')
            .doc(`PRODUCT_${productData.code.toUpperCase()}`);
          transaction.set(
            codeRegRef,
            {
              status: 'RESERVED_ARCHIVED',
              updatedAt: now,
            },
            { merge: true }
          );
        }

        // 3. Cascade archival to child variants (if any exist)
        const variantsQuery = productRef.collection('variants').where('status', '!=', 'ARCHIVED');
        const variantsSnap = await transaction.get(variantsQuery);
        for (const variantDoc of variantsSnap.docs) {
          transaction.update(variantDoc.ref, {
            status: 'ARCHIVED',
            updatedAt: now,
          });
        }
      });

      return {
        success: true,
        productId,
        message: 'Product archived successfully',
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * Sets product lifecycle status between ACTIVE and INACTIVE.
 * (For ARCHIVED, use archiveProduct).
 */
export const setProductStatus = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<{ organizationId: string; productId: string; status: 'ACTIVE' | 'INACTIVE' }>) => {
    try {
      const { organizationId, productId, status } = request.data || {};
      if (!organizationId || !productId || !status) {
        throw new ValidationError('organizationId, productId, and status are required');
      }

      if (status !== 'ACTIVE' && status !== 'INACTIVE') {
        throw new ValidationError('Status must be ACTIVE or INACTIVE');
      }

      await requireRole(request, organizationId, ['OWNER', 'MANAGER']);

      const productRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('products')
        .doc(productId);

      const productDoc = await productRef.get();
      if (!productDoc.exists) {
        throw new NotFoundError('Product not found');
      }

      const currentStatus = productDoc.data()?.status;
      if (currentStatus === 'ARCHIVED') {
        throw new ValidationError('Cannot change status of an archived product');
      }

      const now = firestore.Timestamp.now();
      await productRef.update({
        status,
        updatedAt: now,
      });

      // Update code registry status
      const code = productDoc.data()?.code;
      if (code) {
        await db
          .collection('organizations')
          .doc(organizationId)
          .collection('codeRegistry')
          .doc(`PRODUCT_${code.toUpperCase()}`)
          .set(
            {
              status,
              updatedAt: now,
            },
            { merge: true }
          );
      }

      return {
        success: true,
        productId,
        status,
        message: `Product status updated to ${status}`,
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);
