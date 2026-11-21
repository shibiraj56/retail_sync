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
  SaveVariantsSyncInputSchema,
  UpsertSingleVariantInputSchema,
  ArchiveVariantInputSchema,
  ValidateIdentifierInputSchema,
  VariantAxesListSchema,
  type SaveVariantsSyncInput,
  type UpsertSingleVariantInput,
  type ArchiveVariantInput,
  type ValidateIdentifierInput,
} from '../../schemas/variants';
import {
  validateSku,
  detectAndValidateBarcode,
  generateDeterministicVariantId,
  validateVariantAxes,
  generateCartesianCombinations,
  generateSkuFromTemplate,
  normalizeSku,
} from '../../shared/identifiers';

const CATALOG_ALLOWED_ROLES = ['OWNER', 'MANAGER', 'INVENTORY_MANAGER'] as const;

/**
 * 1. Generates or previews a product variant matrix in memory.
 * Computes deterministic variant IDs and matches with existing variants to preserve
 * SKUs, barcodes, pricing, and historical IDs.
 */
export const generateVariantMatrix = onCall(
  { region: 'asia-south1' },
  async (
    request: CallableRequest<{
      organizationId: string;
      productId: string;
      axes: Array<{ name: string; values: string[] }>;
      skuTemplate?: string;
    }>
  ) => {
    try {
      const { organizationId, productId, axes, skuTemplate } = request.data || {};
      if (!organizationId || !productId) {
        throw new ValidationError('organizationId and productId are required');
      }

      await requireRole(request, organizationId, [...CATALOG_ALLOWED_ROLES]);

      const axesValidation = VariantAxesListSchema.safeParse(axes);
      if (!axesValidation.success) {
        throw new ValidationError(
          `Invalid axes configuration: ${axesValidation.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const productDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('products')
        .doc(productId)
        .get();

      if (!productDoc.exists) {
        throw new NotFoundError(`Product '${productId}' not found`);
      }
      const productData = productDoc.data();
      if (!productData || productData.status === 'ARCHIVED') {
        throw new ValidationError('Cannot generate variants for an archived product');
      }

      const validatedAxes = validateVariantAxes(axes);
      if (!validatedAxes.valid) {
        throw new ValidationError(validatedAxes.error || 'Invalid axes');
      }

      const combinations = generateCartesianCombinations(validatedAxes.validatedAxes);

      // Fetch all existing variants for this product to preserve identifiers and pricing
      const existingVariantsSnap = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('products')
        .doc(productId)
        .collection('variants')
        .get();

      const existingVariantsMap = new Map<string, firestore.DocumentData>();
      for (const doc of existingVariantsSnap.docs) {
        existingVariantsMap.set(doc.id, doc.data());
      }

      const template = skuTemplate?.trim() || `{PRODUCT_CODE}-{INDEX_PAD}`;
      const productCode = productData.code || 'PRD';

      const matchedVariantIds = new Set<string>();

      const generatedVariants = combinations.map((combo, idx) => {
        const deterministicId = generateDeterministicVariantId(productId, combo);
        matchedVariantIds.add(deterministicId);

        const existing = existingVariantsMap.get(deterministicId);
        if (existing) {
          // Existing variant matches: preserve all existing configurations
          return {
            id: deterministicId,
            sku: existing.sku,
            barcode: existing.barcode,
            additionalBarcodes: existing.additionalBarcodes || [],
            attributeValues: existing.attributeValues || combo,
            pricing: existing.pricing,
            taxRatePercent: existing.taxRatePercent ?? (productData.taxData?.taxRatePercent || 0),
            trackInventory: existing.trackInventory ?? true,
            reorderPoint: existing.reorderPoint ?? 0,
            status: existing.status,
            isExisting: true,
          };
        }

        // New proposed variant
        const generatedSku = generateSkuFromTemplate(template, {
          productCode,
          attributes: combo,
          index: idx + 1,
        });

        return {
          id: deterministicId,
          sku: generatedSku,
          barcode: '', // To be assigned or scanned
          additionalBarcodes: [],
          attributeValues: combo,
          pricing: {
            mrp: 0,
            sellingPrice: 0,
            costPrice: 0,
          },
          taxRatePercent: productData.taxData?.taxRatePercent || 0,
          trackInventory: true,
          reorderPoint: 0,
          status: 'ACTIVE',
          isExisting: false,
        };
      });

      // Identify orphaned existing variants (present in DB but omitted in the new matrix)
      const orphanedVariants: any[] = [];
      for (const [id, data] of existingVariantsMap.entries()) {
        if (!matchedVariantIds.has(id)) {
          orphanedVariants.push({
            id,
            sku: data.sku,
            barcode: data.barcode,
            attributeValues: data.attributeValues,
            status: data.status,
          });
        }
      }

      return {
        success: true,
        productId,
        productCode,
        totalCombinations: combinations.length,
        variants: generatedVariants,
        orphanedVariants,
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * 2. Synchronous transactional save for bounded matrices (<= 50 variants).
 * Executes atomic Firestore transaction:
 * - Reads all SKU and Barcode registry entries.
 * - Detects collisions / cross-assignment.
 * - Atomically registers new SKUs and Barcodes.
 * - Preserves retired identifiers as RESERVED_ARCHIVED.
 * - Writes all variant documents and updates product.hasVariants.
 */
export const saveProductVariantsSync = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<SaveVariantsSyncInput>) => {
    try {
      const parseResult = SaveVariantsSyncInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid variants payload: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const input = parseResult.data;
      const { organizationId, productId, variants } = input;

      await requireRole(request, organizationId, [...CATALOG_ALLOWED_ROLES]);

      const productRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('products')
        .doc(productId);

      const variantsColRef = productRef.collection('variants');
      const skuRegColRef = db.collection('organizations').doc(organizationId).collection('skuRegistry');
      const barcodeRegColRef = db.collection('organizations').doc(organizationId).collection('barcodeRegistry');

      await db.runTransaction(async (transaction) => {
        // ====================================================================
        // PHASE 1: ALL TRANSACTION READS FIRST
        // ====================================================================

        // A. Read Product Master
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists) {
          throw new NotFoundError(`Product '${productId}' not found`);
        }
        const productData = productDoc.data();
        if (!productData || productData.status === 'ARCHIVED') {
          throw new ValidationError('Cannot update variants for an archived product');
        }

        // B. Read all incoming Variant Documents
        const variantRefs = variants.map((v) => {
          const varId = v.id || generateDeterministicVariantId(productId, v.attributeValues);
          return {
            variantRef: variantsColRef.doc(varId),
            variantId: varId,
            inputItem: v,
          };
        });

        const existingVariantDocs = await Promise.all(
          variantRefs.map((item) => transaction.get(item.variantRef))
        );

        // Map old SKUs and Barcodes for replacement checks
        const oldIdentMap = new Map<string, { oldSku?: string; oldBarcodes: string[] }>();
        for (let i = 0; i < existingVariantDocs.length; i++) {
          const docSnap = existingVariantDocs[i];
          const varId = variantRefs[i].variantId;
          if (docSnap.exists) {
            const data = docSnap.data();
            const oldBarcodes: string[] = [];
            if (data?.barcode) oldBarcodes.push(data.barcode);
            if (Array.isArray(data?.additionalBarcodes)) oldBarcodes.push(...data.additionalBarcodes);
            oldIdentMap.set(varId, {
              oldSku: data?.sku,
              oldBarcodes,
            });
          }
        }

        // C. Read all SKU Registry Documents
        const skuReadMap = new Map<string, firestore.DocumentReference>();
        for (const v of variants) {
          const normSku = normalizeSku(v.sku);
          if (!skuReadMap.has(normSku)) {
            skuReadMap.set(normSku, skuRegColRef.doc(normSku));
          }
        }
        // Also read old SKUs being replaced to update their status
        for (const [, oldIdents] of oldIdentMap.entries()) {
          if (oldIdents.oldSku) {
            const normOld = normalizeSku(oldIdents.oldSku);
            if (!skuReadMap.has(normOld)) {
              skuReadMap.set(normOld, skuRegColRef.doc(normOld));
            }
          }
        }

        const skuDocs = await Promise.all(
          Array.from(skuReadMap.values()).map((ref) => transaction.get(ref))
        );
        const skuDataMap = new Map<string, firestore.DocumentSnapshot>();
        let skuIdx = 0;
        for (const normSku of skuReadMap.keys()) {
          skuDataMap.set(normSku, skuDocs[skuIdx++]);
        }

        // D. Read all Barcode Registry Documents
        const barcodeReadMap = new Map<string, firestore.DocumentReference>();
        for (const v of variants) {
          if (v.barcode) {
            const normBc = v.barcode.trim().toUpperCase();
            if (!barcodeReadMap.has(normBc)) {
              barcodeReadMap.set(normBc, barcodeRegColRef.doc(normBc));
            }
          }
          if (v.additionalBarcodes) {
            for (const b of v.additionalBarcodes) {
              const normBc = b.trim().toUpperCase();
              if (!barcodeReadMap.has(normBc)) {
                barcodeReadMap.set(normBc, barcodeRegColRef.doc(normBc));
              }
            }
          }
        }
        // Also read old barcodes being replaced
        for (const [, oldIdents] of oldIdentMap.entries()) {
          for (const oldBc of oldIdents.oldBarcodes) {
            const normOld = oldBc.trim().toUpperCase();
            if (!barcodeReadMap.has(normOld)) {
              barcodeReadMap.set(normOld, barcodeRegColRef.doc(normOld));
            }
          }
        }

        const barcodeDocs = await Promise.all(
          Array.from(barcodeReadMap.values()).map((ref) => transaction.get(ref))
        );
        const barcodeDataMap = new Map<string, firestore.DocumentSnapshot>();
        let bcIdx = 0;
        for (const normBc of barcodeReadMap.keys()) {
          barcodeDataMap.set(normBc, barcodeDocs[bcIdx++]);
        }

        // ====================================================================
        // PHASE 2: VALIDATE INTEGRITY CONSTRAINTS IN READ PHASE
        // ====================================================================

        for (const item of variantRefs) {
          const varId = item.variantId;
          const v = item.inputItem;
          const normSku = normalizeSku(v.sku);

          // 1. Check SKU Uniqueness & Collision
          const skuSnap = skuDataMap.get(normSku);
          if (skuSnap && skuSnap.exists) {
            const reg = skuSnap.data();
            if (reg?.status === 'RESERVED_ARCHIVED') {
              throw new ConflictError(
                `SKU '${normSku}' is permanently reserved and cannot be reassigned`
              );
            }
            if (reg?.targetVariantId && reg.targetVariantId !== varId) {
              throw new ConflictError(
                `SKU '${normSku}' is already registered to another variant ('${reg.targetVariantId}')`
              );
            }
          }

          // 2. Check Primary Barcode Uniqueness & Checksum
          if (v.barcode) {
            const bcResult = detectAndValidateBarcode(v.barcode);
            if (!bcResult.valid) {
              throw new ValidationError(`Barcode '${v.barcode}' is invalid: ${bcResult.error}`);
            }
            const normBc = bcResult.normalized;
            const bcSnap = barcodeDataMap.get(normBc);
            if (bcSnap && bcSnap.exists) {
              const reg = bcSnap.data();
              if (reg?.status === 'RESERVED_ARCHIVED') {
                throw new ConflictError(
                  `Barcode '${normBc}' is permanently reserved and cannot be reused`
                );
              }
              if (reg?.targetVariantId && reg.targetVariantId !== varId) {
                throw new ConflictError(
                  `Barcode '${normBc}' is already assigned to variant '${reg.targetVariantId}'`
                );
              }
            }
          }

          // 3. Check Additional Barcodes Uniqueness & Checksum
          if (v.additionalBarcodes) {
            for (const addBc of v.additionalBarcodes) {
              const bcResult = detectAndValidateBarcode(addBc);
              if (!bcResult.valid) {
                throw new ValidationError(`Additional barcode '${addBc}' is invalid: ${bcResult.error}`);
              }
              const normBc = bcResult.normalized;
              const bcSnap = barcodeDataMap.get(normBc);
              if (bcSnap && bcSnap.exists) {
                const reg = bcSnap.data();
                if (reg?.status === 'RESERVED_ARCHIVED') {
                  throw new ConflictError(`Barcode '${normBc}' is permanently reserved`);
                }
                if (reg?.targetVariantId && reg.targetVariantId !== varId) {
                  throw new ConflictError(
                    `Barcode '${normBc}' is already assigned to variant '${reg.targetVariantId}'`
                  );
                }
              }
            }
          }
        }

        // ====================================================================
        // PHASE 3: ALL WRITES SECOND
        // ====================================================================
        const now = firestore.Timestamp.now();

        // 1. Process SKU Replacements & New Reservations
        for (const item of variantRefs) {
          const varId = item.variantId;
          const v = item.inputItem;
          const normSku = normalizeSku(v.sku);
          const oldIdents = oldIdentMap.get(varId);

          // If SKU changed on an existing variant, mark old SKU as RESERVED_ARCHIVED
          if (oldIdents?.oldSku && normalizeSku(oldIdents.oldSku) !== normSku) {
            const oldSkuNorm = normalizeSku(oldIdents.oldSku);
            const oldSkuRef = skuRegColRef.doc(oldSkuNorm);
            transaction.set(
              oldSkuRef,
              {
                status: 'RESERVED_ARCHIVED',
                supersededBy: normSku,
                retiredAt: now,
                updatedAt: now,
              },
              { merge: true }
            );
          }

          // Register new/current SKU
          const skuRef = skuRegColRef.doc(normSku);
          transaction.set(skuRef, {
            id: normSku,
            organizationId,
            sku: normSku,
            targetProductId: productId,
            targetVariantId: varId,
            status: v.status === 'ARCHIVED' ? 'RESERVED_ARCHIVED' : 'ACTIVE',
            updatedAt: now,
            createdAt: now,
          }, { merge: true });

          // 2. Process Barcode Replacements & New Reservations
          const currentBarcodes = new Set<string>();
          if (v.barcode) currentBarcodes.add(v.barcode.trim().toUpperCase());
          if (v.additionalBarcodes) {
            for (const b of v.additionalBarcodes) currentBarcodes.add(b.trim().toUpperCase());
          }

          // Retire removed barcodes
          if (oldIdents?.oldBarcodes) {
            for (const oldBc of oldIdents.oldBarcodes) {
              const normOld = oldBc.trim().toUpperCase();
              if (!currentBarcodes.has(normOld)) {
                const oldBcRef = barcodeRegColRef.doc(normOld);
                transaction.set(
                  oldBcRef,
                  {
                    status: 'RESERVED_ARCHIVED',
                    retiredAt: now,
                    updatedAt: now,
                  },
                  { merge: true }
                );
              }
            }
          }

          // Register primary barcode
          if (v.barcode) {
            const bcResult = detectAndValidateBarcode(v.barcode);
            const normBc = bcResult.normalized;
            const bcRef = barcodeRegColRef.doc(normBc);
            transaction.set(bcRef, {
              id: normBc,
              organizationId,
              barcode: normBc,
              type: bcResult.type,
              targetProductId: productId,
              targetVariantId: varId,
              isPrimary: true,
              status: v.status === 'ARCHIVED' ? 'RESERVED_ARCHIVED' : 'ACTIVE',
              updatedAt: now,
              createdAt: now,
            }, { merge: true });
          }

          // Register additional barcodes
          if (v.additionalBarcodes) {
            for (const addBc of v.additionalBarcodes) {
              const bcResult = detectAndValidateBarcode(addBc);
              const normBc = bcResult.normalized;
              const bcRef = barcodeRegColRef.doc(normBc);
              transaction.set(bcRef, {
                id: normBc,
                organizationId,
                barcode: normBc,
                type: bcResult.type,
                targetProductId: productId,
                targetVariantId: varId,
                isPrimary: false,
                status: v.status === 'ARCHIVED' ? 'RESERVED_ARCHIVED' : 'ACTIVE',
                updatedAt: now,
                createdAt: now,
              }, { merge: true });
            }
          }

          // 3. Write Base Variant Document (Retail / POS facing)
          const docSnap = existingVariantDocs.find((d, idx) => variantRefs[idx].variantId === varId);
          const isExisting = docSnap && docSnap.exists;

          const variantData: Record<string, any> = {
            id: varId,
            productId,
            organizationId,
            sku: normSku,
            barcode: v.barcode ? v.barcode.trim().toUpperCase() : '',
            additionalBarcodes: v.additionalBarcodes ? v.additionalBarcodes.map((b) => b.trim().toUpperCase()) : [],
            attributeValues: v.attributeValues,
            pricing: {
              mrp: v.pricing.mrp,
              sellingPrice: v.pricing.sellingPrice,
            },
            taxRatePercent: v.taxRatePercent,
            trackInventory: v.trackInventory,
            reorderPoint: v.reorderPoint,
            status: v.status,
            updatedAt: now,
            createdAt: isExisting ? (docSnap.data()?.createdAt || now) : now,
          };

          // Explicitly purge legacy cost price fields from top-level document
          if (isExisting) {
            variantData['pricing.costPrice'] = firestore.FieldValue.delete();
            variantData['pricing.wholesalePrice'] = firestore.FieldValue.delete();
            variantData['pricing.minimumSellingPrice'] = firestore.FieldValue.delete();
          }

          transaction.set(item.variantRef, variantData, { merge: true });

          // 3b. Write Protected Restricted Pricing Document (Strictly OWNER / MANAGER)
          const restrictedPricingRef = item.variantRef.collection('restrictedPricing').doc('current');
          transaction.set(
            restrictedPricingRef,
            {
              id: 'current',
              organizationId,
              productId,
              variantId: varId,
              costPrice: v.pricing.costPrice,
              wholesalePrice: v.pricing.wholesalePrice ?? null,
              minimumSellingPrice: v.pricing.minimumSellingPrice ?? null,
              updatedAt: now,
              createdAt: now,
            },
            { merge: true }
          );
        }

        // 4. Update Product master flag
        transaction.update(productRef, {
          hasVariants: true,
          updatedAt: now,
        });
      });

      return {
        success: true,
        productId,
        savedVariantsCount: variants.length,
        message: `Successfully saved ${variants.length} product variants`,
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * 3. Upsert a single variant (create or update).
 */
export const upsertSingleVariant = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<UpsertSingleVariantInput>) => {
    try {
      const parseResult = UpsertSingleVariantInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid variant input: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const { organizationId, productId, variant } = parseResult.data;
      await requireRole(request, organizationId, [...CATALOG_ALLOWED_ROLES]);

      // Re-use saveProductVariantsSync for single item
      const syncResult = await saveProductVariantsSync.run(
        {
          ...request,
          data: {
            organizationId,
            productId,
            variants: [variant],
          },
        } as any
      );

      return syncResult;
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * 4. Soft-archives a single variant and permanently retires its SKU and barcodes as RESERVED_ARCHIVED.
 */
export const archiveVariant = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<ArchiveVariantInput>) => {
    try {
      const parseResult = ArchiveVariantInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid input: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const { organizationId, productId, variantId } = parseResult.data;
      await requireRole(request, organizationId, [...CATALOG_ALLOWED_ROLES]);

      const variantRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('products')
        .doc(productId)
        .collection('variants')
        .doc(variantId);

      const skuRegColRef = db.collection('organizations').doc(organizationId).collection('skuRegistry');
      const barcodeRegColRef = db.collection('organizations').doc(organizationId).collection('barcodeRegistry');

      await db.runTransaction(async (transaction) => {
        const variantDoc = await transaction.get(variantRef);
        if (!variantDoc.exists) {
          throw new NotFoundError(`Variant '${variantId}' not found`);
        }

        const data = variantDoc.data();
        if (!data || data.status === 'ARCHIVED') {
          return; // Already archived
        }

        const now = firestore.Timestamp.now();

        // 1. Archive variant document
        transaction.update(variantRef, {
          status: 'ARCHIVED',
          updatedAt: now,
        });

        // 2. Transition SKU to RESERVED_ARCHIVED
        if (data.sku) {
          const normSku = normalizeSku(data.sku);
          const skuRef = skuRegColRef.doc(normSku);
          transaction.set(
            skuRef,
            {
              status: 'RESERVED_ARCHIVED',
              retiredAt: now,
              updatedAt: now,
            },
            { merge: true }
          );
        }

        // 3. Transition all Barcodes to RESERVED_ARCHIVED
        const barcodesToRetire: string[] = [];
        if (data.barcode) barcodesToRetire.push(data.barcode);
        if (Array.isArray(data.additionalBarcodes)) barcodesToRetire.push(...data.additionalBarcodes);

        for (const bc of barcodesToRetire) {
          const normBc = bc.trim().toUpperCase();
          const bcRef = barcodeRegColRef.doc(normBc);
          transaction.set(
            bcRef,
            {
              status: 'RESERVED_ARCHIVED',
              retiredAt: now,
              updatedAt: now,
            },
            { merge: true }
          );
        }
      });

      return {
        success: true,
        variantId,
        message: `Variant '${variantId}' archived and identifiers retired`,
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * 5. Preflight validation endpoint for SKUs or Barcodes.
 * Validates format and tests whether the identifier is available in the organization's registry.
 */
export const validateIdentifier = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<ValidateIdentifierInput>) => {
    try {
      const parseResult = ValidateIdentifierInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Validation failed: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const { organizationId, type, value, excludeVariantId } = parseResult.data;
      await requireRole(request, organizationId, [...CATALOG_ALLOWED_ROLES]);

      if (type === 'SKU') {
        const skuVal = validateSku(value);
        if (!skuVal.valid) {
          return {
            valid: false,
            available: false,
            error: skuVal.error,
          };
        }

        const skuDoc = await db
          .collection('organizations')
          .doc(organizationId)
          .collection('skuRegistry')
          .doc(skuVal.normalized)
          .get();

        if (!skuDoc.exists) {
          return { valid: true, available: true, normalized: skuVal.normalized };
        }

        const data = skuDoc.data();
        if (data?.status === 'RESERVED_ARCHIVED') {
          return {
            valid: true,
            available: false,
            error: `SKU '${skuVal.normalized}' is permanently reserved and cannot be reused`,
          };
        }

        if (excludeVariantId && data?.targetVariantId === excludeVariantId) {
          return { valid: true, available: true, normalized: skuVal.normalized };
        }

        return {
          valid: true,
          available: false,
          error: `SKU '${skuVal.normalized}' is already registered to another variant`,
        };
      }

      if (type === 'BARCODE') {
        const bcResult = detectAndValidateBarcode(value);
        if (!bcResult.valid) {
          return {
            valid: false,
            available: false,
            error: bcResult.error,
          };
        }

        const bcDoc = await db
          .collection('organizations')
          .doc(organizationId)
          .collection('barcodeRegistry')
          .doc(bcResult.normalized)
          .get();

        if (!bcDoc.exists) {
          return {
            valid: true,
            available: true,
            type: bcResult.type,
            normalized: bcResult.normalized,
          };
        }

        const data = bcDoc.data();
        if (data?.status === 'RESERVED_ARCHIVED') {
          return {
            valid: true,
            available: false,
            error: `Barcode '${bcResult.normalized}' is permanently reserved and cannot be reused`,
          };
        }

        if (excludeVariantId && data?.targetVariantId === excludeVariantId) {
          return {
            valid: true,
            available: true,
            type: bcResult.type,
            normalized: bcResult.normalized,
          };
        }

        return {
          valid: true,
          available: false,
          error: `Barcode '${bcResult.normalized}' is already assigned to another variant`,
        };
      }

      throw new ValidationError('Invalid identifier type');
    } catch (error) {
      handleFunctionError(error);
    }
  }
);
