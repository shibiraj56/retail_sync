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
  UpsertCategoryInputSchema,
  type UpsertCategoryInput,
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
 * Creates or updates a product category inside an organization.
 * Enforces:
 * 1. Strict 2-level hierarchy (Level 1 Root, Level 2 Subcategory).
 * 2. Circular reference prevention (cannot be own parent).
 * 3. Organization-wide code uniqueness via `/codeRegistry/CATEGORY_{code}` inside runTransaction.
 */
export const upsertCategory = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<UpsertCategoryInput>) => {
    try {
      const parseResult = UpsertCategoryInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid category payload: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const input = parseResult.data;
      const { organizationId } = input;

      // Authoritative RBAC assertion: Only OWNER or MANAGER can write catalog records
      await requireRole(request, organizationId, ['OWNER', 'MANAGER']);

      const normalizedCode = input.code.toUpperCase();
      const codeRegistryDocId = `CATEGORY_${normalizedCode}`;
      const codeRegistryRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('codeRegistry')
        .doc(codeRegistryDocId);

      const categoryId = input.id || db.collection('organizations').doc(organizationId).collection('categories').doc().id;
      const categoryRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('categories')
        .doc(categoryId);

      await db.runTransaction(async (transaction) => {
        // --- 1. ALL READS FIRST ---
        // A. Code Registry Existence Check
        const codeRegDoc = await transaction.get(codeRegistryRef);
        if (codeRegDoc.exists) {
          const regData = codeRegDoc.data();
          if (regData && regData.targetDocumentId !== categoryId) {
            throw new ConflictError(
              `Category code '${normalizedCode}' is already registered to another category in this organization`
            );
          }
        }

        // B. Check Existing Category if Updating
        const existingCategoryDoc = await transaction.get(categoryRef);
        let oldCode: string | null = null;
        if (existingCategoryDoc.exists) {
          const oldData = existingCategoryDoc.data();
          oldCode = oldData?.code ? oldData.code.toUpperCase() : null;
        }

        // C. Hierarchy Validation
        let level: 1 | 2 = 1;
        if (input.parentId) {
          if (input.parentId === categoryId) {
            throw new ValidationError('A category cannot be its own parent');
          }

          const parentRef = db
            .collection('organizations')
            .doc(organizationId)
            .collection('categories')
            .doc(input.parentId);
          const parentDoc = await transaction.get(parentRef);

          if (!parentDoc.exists) {
            throw new NotFoundError(`Parent category '${input.parentId}' not found`);
          }

          const parentData = parentDoc.data();
          if (!parentData || parentData.status === 'ARCHIVED') {
            throw new ValidationError('Cannot assign an archived category as parent');
          }

          // Strict 2-level hierarchy: Parent must be Level 1 (cannot have a parent itself)
          if (parentData.parentId !== null || parentData.level !== 1) {
            throw new ValidationError(
              'A subcategory cannot have another subcategory as parent. Maximum hierarchy is 2 levels (Root -> Subcategory).'
            );
          }

          level = 2;
        }

        // D. Check Old Code Registry if Code Changed
        let oldCodeRegistryRef: firestore.DocumentReference | null = null;
        if (oldCode && oldCode !== normalizedCode) {
          oldCodeRegistryRef = db
            .collection('organizations')
            .doc(organizationId)
            .collection('codeRegistry')
            .doc(`CATEGORY_${oldCode}`);
        }

        // --- 2. ALL WRITES AFTER READS ---
        const now = firestore.Timestamp.now();
        const slug = `${slugify(input.name)}-${normalizedCode.toLowerCase()}`;

        // Preserve old code registry entry as RESERVED_ARCHIVED if code changed (Never delete per audit policy)
        if (oldCodeRegistryRef) {
          transaction.set(oldCodeRegistryRef, {
            status: 'RESERVED_ARCHIVED',
            supersededBy: normalizedCode,
            updatedAt: now,
          }, { merge: true });
        }

        // Write new code registry reservation
        transaction.set(codeRegistryRef, {
          id: codeRegistryDocId,
          organizationId,
          entityType: 'CATEGORY',
          targetDocumentId: categoryId,
          status: input.status,
          createdAt: existingCategoryDoc.exists ? (existingCategoryDoc.data()?.createdAt || now) : now,
          updatedAt: now,
        });

        // Write Category document
        const categoryData = {
          id: categoryId,
          organizationId,
          name: input.name,
          code: normalizedCode,
          slug,
          parentId: input.parentId || null,
          level,
          description: input.description || null,
          defaultTaxClassification: input.defaultTaxClassification || null,
          displayOrder: input.displayOrder,
          status: input.status,
          createdAt: existingCategoryDoc.exists ? (existingCategoryDoc.data()?.createdAt || now) : now,
          updatedAt: now,
        };

        transaction.set(categoryRef, categoryData, { merge: true });
      });

      return {
        success: true,
        categoryId,
        message: 'Category saved successfully',
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * Soft-archives a product category.
 * Prevents archival if active subcategories or active products reference it.
 */
export const archiveCategory = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<{ organizationId: string; categoryId: string }>) => {
    try {
      const { organizationId, categoryId } = request.data || {};
      if (!organizationId || !categoryId) {
        throw new ValidationError('organizationId and categoryId are required');
      }

      await requireRole(request, organizationId, ['OWNER', 'MANAGER']);

      const categoryRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('categories')
        .doc(categoryId);

      await db.runTransaction(async (transaction) => {
        // Read category
        const categoryDoc = await transaction.get(categoryRef);
        if (!categoryDoc.exists) {
          throw new NotFoundError('Category not found');
        }

        const categoryData = categoryDoc.data();
        if (!categoryData) {
          throw new NotFoundError('Category data is empty');
        }

        // Check if there are active subcategories
        const subcategoriesQuery = db
          .collection('organizations')
          .doc(organizationId)
          .collection('categories')
          .where('parentId', '==', categoryId)
          .where('status', '==', 'ACTIVE');
        const subcategoriesSnap = await transaction.get(subcategoriesQuery);

        if (!subcategoriesSnap.empty) {
          throw new ValidationError(
            'Cannot archive category with active subcategories. Archive or reassign subcategories first.'
          );
        }

        // Check if existing products reference this category
        const productsQuery = db
          .collection('organizations')
          .doc(organizationId)
          .collection('products')
          .where('categoryId', '==', categoryId)
          .where('status', 'in', ['ACTIVE', 'INACTIVE']);
        const productsSnap = await transaction.get(productsQuery);

        if (!productsSnap.empty) {
          throw new ValidationError(
            'Cannot archive category because it is referenced by existing active or inactive products. Archive or reassign products first.'
          );
        }

        const now = firestore.Timestamp.now();

        // Update category status
        transaction.update(categoryRef, {
          status: 'ARCHIVED',
          updatedAt: now,
        });

        // Mark code registry as RESERVED_ARCHIVED
        if (categoryData.code) {
          const codeRegRef = db
            .collection('organizations')
            .doc(organizationId)
            .collection('codeRegistry')
            .doc(`CATEGORY_${categoryData.code.toUpperCase()}`);
          transaction.update(codeRegRef, {
            status: 'RESERVED_ARCHIVED',
            updatedAt: now,
          });
        }
      });

      return {
        success: true,
        categoryId,
        message: 'Category archived successfully',
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);
