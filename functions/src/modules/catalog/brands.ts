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
  UpsertBrandInputSchema,
  type UpsertBrandInput,
} from '../../schemas/catalog';

export const upsertBrand = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<UpsertBrandInput>) => {
    try {
      const parseResult = UpsertBrandInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid brand payload: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const input = parseResult.data;
      const { organizationId } = input;

      // Authoritative RBAC assertion: Only OWNER or MANAGER can write catalog records
      await requireRole(request, organizationId, ['OWNER', 'MANAGER']);

      const normalizedCode = input.code.toUpperCase();
      const codeRegistryDocId = `BRAND_${normalizedCode}`;
      const codeRegistryRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('codeRegistry')
        .doc(codeRegistryDocId);

      const brandId = input.id || db.collection('organizations').doc(organizationId).collection('brands').doc().id;
      const brandRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('brands')
        .doc(brandId);

      await db.runTransaction(async (transaction) => {
        // --- 1. ALL READS FIRST ---
        const codeRegDoc = await transaction.get(codeRegistryRef);
        if (codeRegDoc.exists) {
          const regData = codeRegDoc.data();
          if (regData && regData.targetDocumentId !== brandId) {
            throw new ConflictError(
              `Brand code '${normalizedCode}' is already registered to another brand in this organization`
            );
          }
        }

        const existingBrandDoc = await transaction.get(brandRef);
        let oldCode: string | null = null;
        if (existingBrandDoc.exists) {
          const oldData = existingBrandDoc.data();
          oldCode = oldData?.code ? oldData.code.toUpperCase() : null;
        }

        let oldCodeRegistryRef: firestore.DocumentReference | null = null;
        if (oldCode && oldCode !== normalizedCode) {
          oldCodeRegistryRef = db
            .collection('organizations')
            .doc(organizationId)
            .collection('codeRegistry')
            .doc(`BRAND_${oldCode}`);
        }

        // --- 2. ALL WRITES AFTER READS ---
        const now = firestore.Timestamp.now();

        // Preserve old code registry entry as RESERVED_ARCHIVED if code changed (Never delete per audit policy)
        if (oldCodeRegistryRef) {
          transaction.set(oldCodeRegistryRef, {
            status: 'RESERVED_ARCHIVED',
            supersededBy: normalizedCode,
            updatedAt: now,
          }, { merge: true });
        }

        transaction.set(codeRegistryRef, {
          id: codeRegistryDocId,
          organizationId,
          entityType: 'BRAND',
          targetDocumentId: brandId,
          status: input.status,
          createdAt: existingBrandDoc.exists ? (existingBrandDoc.data()?.createdAt || now) : now,
          updatedAt: now,
        });

        const brandData = {
          id: brandId,
          organizationId,
          name: input.name,
          code: normalizedCode,
          logoUrl: input.logoUrl || null,
          description: input.description || null,
          manufacturerName: input.manufacturerName || null,
          supportEmail: input.supportEmail || null,
          supportPhone: input.supportPhone || null,
          status: input.status,
          createdAt: existingBrandDoc.exists ? (existingBrandDoc.data()?.createdAt || now) : now,
          updatedAt: now,
        };

        transaction.set(brandRef, brandData, { merge: true });
      });

      return {
        success: true,
        brandId,
        message: 'Brand saved successfully',
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

export const archiveBrand = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<{ organizationId: string; brandId: string }>) => {
    try {
      const { organizationId, brandId } = request.data || {};
      if (!organizationId || !brandId) {
        throw new ValidationError('organizationId and brandId are required');
      }

      await requireRole(request, organizationId, ['OWNER', 'MANAGER']);

      const brandRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('brands')
        .doc(brandId);

      await db.runTransaction(async (transaction) => {
        const brandDoc = await transaction.get(brandRef);
        if (!brandDoc.exists) {
          throw new NotFoundError('Brand not found');
        }

        const brandData = brandDoc.data();
        if (!brandData) {
          throw new NotFoundError('Brand data is empty');
        }

        // Check if existing products reference this brand
        const productsQuery = db
          .collection('organizations')
          .doc(organizationId)
          .collection('products')
          .where('brandId', '==', brandId)
          .where('status', 'in', ['ACTIVE', 'INACTIVE']);
        const productsSnap = await transaction.get(productsQuery);

        if (!productsSnap.empty) {
          throw new ValidationError(
            'Cannot archive brand because it is referenced by existing active or inactive products. Archive or reassign products first.'
          );
        }

        const now = firestore.Timestamp.now();

        transaction.update(brandRef, {
          status: 'ARCHIVED',
          updatedAt: now,
        });

        if (brandData.code) {
          const codeRegRef = db
            .collection('organizations')
            .doc(organizationId)
            .collection('codeRegistry')
            .doc(`BRAND_${brandData.code.toUpperCase()}`);
          transaction.update(codeRegRef, {
            status: 'RESERVED_ARCHIVED',
            updatedAt: now,
          });
        }
      });

      return {
        success: true,
        brandId,
        message: 'Brand archived successfully',
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);
