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
  CreateVariantMatrixJobInputSchema,
  ProcessJobChunkInputSchema,
  type CreateVariantMatrixJobInput,
  type ProcessJobChunkInput,
} from '../../schemas/variants';
import {
  validateVariantAxes,
  generateCartesianCombinations,
  generateDeterministicVariantId,
  generateSkuFromTemplate,
  normalizeSku,
  detectAndValidateBarcode,
} from '../../shared/identifiers';

const CATALOG_ALLOWED_ROLES = ['OWNER', 'MANAGER', 'INVENTORY_MANAGER'] as const;
const CHUNK_SIZE = 25; // 25 variants * 3 writes = 75 writes, safely bounded below Firestore 500-write limit
const LEASE_DURATION_MS = 60 * 1000; // 60 seconds lease duration

/**
 * Creates and stages a background job for large matrix variant generation.
 */
export const createVariantMatrixJob = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<CreateVariantMatrixJobInput>) => {
    try {
      const parseResult = CreateVariantMatrixJobInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid input: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const input = parseResult.data;
      const { organizationId, productId, axes, skuTemplate, defaultPricing, defaultTaxRatePercent, defaultTrackInventory } = input;

      await requireRole(request, organizationId, [...CATALOG_ALLOWED_ROLES]);

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
      if (combinations.length === 0) {
        throw new ValidationError('Generated 0 combinations from provided axes');
      }

      const productCode = productData.code || 'PRD';
      const template = skuTemplate?.trim() || '{PRODUCT_CODE}-{INDEX_PAD}';

      const plannedVariants = combinations.map((combo, idx) => {
        const id = generateDeterministicVariantId(productId, combo);
        const sku = generateSkuFromTemplate(template, {
          productCode,
          attributes: combo,
          index: idx + 1,
        });
        return {
          id,
          sku,
          barcode: '', // Default empty unless assigned
          additionalBarcodes: [],
          attributeValues: combo,
          pricing: defaultPricing,
          taxRatePercent: defaultTaxRatePercent,
          trackInventory: defaultTrackInventory,
          reorderPoint: 0,
          status: 'ACTIVE',
        };
      });

      const totalChunks = Math.ceil(plannedVariants.length / CHUNK_SIZE);
      const jobsColRef = db.collection('organizations').doc(organizationId).collection('variantJobs');
      const jobId = jobsColRef.doc().id;
      const now = firestore.Timestamp.now();

      const jobData = {
        id: jobId,
        organizationId,
        productId,
        productCode,
        status: 'PENDING',
        totalCombinations: plannedVariants.length,
        processedCount: 0,
        failedCount: 0,
        currentChunkIndex: 0,
        totalChunks,
        chunkSize: CHUNK_SIZE,
        fencingToken: 1,
        leaseWorkerId: null,
        leaseExpiresAt: null,
        errors: [],
        plannedVariants,
        createdAt: now,
        updatedAt: now,
      };

      await jobsColRef.doc(jobId).set(jobData);

      return {
        success: true,
        jobId,
        totalCombinations: plannedVariants.length,
        totalChunks,
        chunkSize: CHUNK_SIZE,
        fencingToken: 1,
        message: `Staged variant job '${jobId}' initialized with ${totalChunks} chunks`,
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * Acquires a worker lease for processing the job chunks.
 * Increments the fencing token to guard against stale workers.
 */
export const acquireJobLease = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<{ organizationId: string; jobId: string; workerId: string }>) => {
    try {
      const { organizationId, jobId, workerId } = request.data || {};
      if (!organizationId || !jobId || !workerId) {
        throw new ValidationError('organizationId, jobId, and workerId are required');
      }

      await requireRole(request, organizationId, [...CATALOG_ALLOWED_ROLES]);

      const jobRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('variantJobs')
        .doc(jobId);

      const leaseResult = await db.runTransaction(async (transaction) => {
        const jobDoc = await transaction.get(jobRef);
        if (!jobDoc.exists) {
          throw new NotFoundError(`Job '${jobId}' not found`);
        }

        const data = jobDoc.data();
        if (!data) throw new NotFoundError('Job data is missing');

        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          throw new ConflictError(`Job is already in terminal state: ${data.status}`);
        }

        const now = firestore.Timestamp.now();
        const currentExpiresAt: firestore.Timestamp | null = data.leaseExpiresAt || null;

        // Verify if active lease exists for a different worker
        if (
          currentExpiresAt &&
          currentExpiresAt.toMillis() > now.toMillis() &&
          data.leaseWorkerId &&
          data.leaseWorkerId !== workerId
        ) {
          throw new ConflictError(
            `Job lease is currently held by worker '${data.leaseWorkerId}' until ${currentExpiresAt.toDate().toISOString()}`
          );
        }

        const nextFencingToken = (data.fencingToken || 1) + 1;
        const newLeaseExpiresAt = firestore.Timestamp.fromMillis(now.toMillis() + LEASE_DURATION_MS);

        transaction.update(jobRef, {
          leaseWorkerId: workerId,
          leaseExpiresAt: newLeaseExpiresAt,
          fencingToken: nextFencingToken,
          status: 'PROCESSING',
          updatedAt: now,
        });

        return {
          fencingToken: nextFencingToken,
          currentChunkIndex: data.currentChunkIndex,
          totalChunks: data.totalChunks,
          leaseExpiresAt: newLeaseExpiresAt.toDate().toISOString(),
        };
      });

      return {
        success: true,
        jobId,
        workerId,
        ...leaseResult,
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * Processes a single bounded chunk of variants for a staged job.
 * Guaranteed by transaction fencing token checking.
 */
export const processVariantMatrixJobChunk = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<ProcessJobChunkInput>) => {
    try {
      const parseResult = ProcessJobChunkInputSchema.safeParse(request.data);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid input: ${parseResult.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      const { organizationId, jobId, workerId, expectedFencingToken } = parseResult.data;
      await requireRole(request, organizationId, [...CATALOG_ALLOWED_ROLES]);

      const jobRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('variantJobs')
        .doc(jobId);

      const result = await db.runTransaction(async (transaction) => {
        // ====================================================================
        // PHASE 1: READS & FENCING TOKEN CHECK
        // ====================================================================
        const jobDoc = await transaction.get(jobRef);
        if (!jobDoc.exists) {
          throw new NotFoundError(`Job '${jobId}' not found`);
        }

        const jobData = jobDoc.data();
        if (!jobData) throw new NotFoundError('Job data is missing');

        // Fencing check: abort if another worker acquired a newer lease
        if (jobData.fencingToken !== expectedFencingToken) {
          throw new ConflictError(
            `Fencing token mismatch! Expected ${expectedFencingToken}, found ${jobData.fencingToken}. Another worker has acquired the lease.`
          );
        }

        // Lease ownership check
        if (jobData.leaseWorkerId !== workerId) {
          throw new ConflictError(`Worker '${workerId}' does not hold the active lease`);
        }

        if (jobData.status === 'COMPLETED') {
          return {
            status: 'COMPLETED',
            currentChunkIndex: jobData.currentChunkIndex,
            totalChunks: jobData.totalChunks,
            processedCount: jobData.processedCount,
          };
        }

        const currentChunk = jobData.currentChunkIndex;
        const chunkSize = jobData.chunkSize || CHUNK_SIZE;
        const startIndex = currentChunk * chunkSize;
        const endIndex = Math.min(startIndex + chunkSize, jobData.totalCombinations);

        const chunkItems: any[] = jobData.plannedVariants.slice(startIndex, endIndex);
        if (chunkItems.length === 0) {
          // Completed
          transaction.update(jobRef, {
            status: 'COMPLETED',
            updatedAt: firestore.Timestamp.now(),
          });
          return { status: 'COMPLETED', currentChunkIndex: currentChunk, totalChunks: jobData.totalChunks };
        }

        const productId = jobData.productId;
        const productRef = db.collection('organizations').doc(organizationId).collection('products').doc(productId);
        const variantsColRef = productRef.collection('variants');
        const skuRegColRef = db.collection('organizations').doc(organizationId).collection('skuRegistry');
        const barcodeRegColRef = db.collection('organizations').doc(organizationId).collection('barcodeRegistry');

        // Read all SKU docs in this chunk
        const skuReadMap = new Map<string, firestore.DocumentReference>();
        for (const item of chunkItems) {
          const normSku = normalizeSku(item.sku);
          if (!skuReadMap.has(normSku)) {
            skuReadMap.set(normSku, skuRegColRef.doc(normSku));
          }
        }
        const skuDocs = await Promise.all(
          Array.from(skuReadMap.values()).map((ref) => transaction.get(ref))
        );
        const skuMap = new Map<string, firestore.DocumentSnapshot>();
        let idx = 0;
        for (const normSku of skuReadMap.keys()) {
          skuMap.set(normSku, skuDocs[idx++]);
        }

        // ====================================================================
        // PHASE 2: VALIDATION & WRITE PREPARATION
        // ====================================================================
        const now = firestore.Timestamp.now();
        const errorsToAdd: any[] = [];
        let chunkProcessed = 0;
        let chunkFailed = 0;

        for (let i = 0; i < chunkItems.length; i++) {
          const item = chunkItems[i];
          const globalIndex = startIndex + i;
          const varId = item.id;
          const normSku = normalizeSku(item.sku);

          // Verify SKU collision
          const skuSnap = skuMap.get(normSku);
          if (skuSnap && skuSnap.exists) {
            const reg = skuSnap.data();
            if (reg?.status === 'RESERVED_ARCHIVED' || (reg?.targetVariantId && reg.targetVariantId !== varId)) {
              errorsToAdd.push({
                variantIndex: globalIndex,
                sku: normSku,
                reason: `SKU '${normSku}' is already registered or permanently reserved`,
              });
              chunkFailed++;
              continue;
            }
          }

          // Register SKU
          transaction.set(skuRegColRef.doc(normSku), {
            id: normSku,
            organizationId,
            sku: normSku,
            targetProductId: productId,
            targetVariantId: varId,
            status: 'ACTIVE',
            updatedAt: now,
            createdAt: now,
          }, { merge: true });

          // Register Barcode (if provided)
          if (item.barcode) {
            const bcResult = detectAndValidateBarcode(item.barcode);
            if (bcResult.valid) {
              const normBc = bcResult.normalized;
              transaction.set(barcodeRegColRef.doc(normBc), {
                id: normBc,
                organizationId,
                barcode: normBc,
                type: bcResult.type,
                targetProductId: productId,
                targetVariantId: varId,
                isPrimary: true,
                status: 'ACTIVE',
                updatedAt: now,
                createdAt: now,
              }, { merge: true });
            }
          }

          // Write Variant Document
          transaction.set(variantsColRef.doc(varId), {
            id: varId,
            productId,
            organizationId,
            sku: normSku,
            barcode: item.barcode || '',
            additionalBarcodes: item.additionalBarcodes || [],
            attributeValues: item.attributeValues,
            pricing: item.pricing,
            taxRatePercent: item.taxRatePercent,
            trackInventory: item.trackInventory,
            reorderPoint: item.reorderPoint,
            status: item.status,
            updatedAt: now,
            createdAt: now,
          }, { merge: true });

          chunkProcessed++;
        }

        // ====================================================================
        // PHASE 3: CHECKPOINT JOB STATUS
        // ====================================================================
        const nextChunk = currentChunk + 1;
        const newTotalProcessed = (jobData.processedCount || 0) + chunkProcessed;
        const newTotalFailed = (jobData.failedCount || 0) + chunkFailed;
        const isFinished = nextChunk >= jobData.totalChunks;
        const updatedStatus = isFinished
          ? newTotalFailed > 0
            ? 'PARTIALLY_FAILED'
            : 'COMPLETED'
          : 'PROCESSING';

        const updatedErrors = [...(jobData.errors || []), ...errorsToAdd];

        transaction.update(jobRef, {
          currentChunkIndex: nextChunk,
          processedCount: newTotalProcessed,
          failedCount: newTotalFailed,
          status: updatedStatus,
          errors: updatedErrors,
          leaseExpiresAt: firestore.Timestamp.fromMillis(now.toMillis() + LEASE_DURATION_MS),
          updatedAt: now,
        });

        // Set Product hasVariants = true
        transaction.update(productRef, {
          hasVariants: true,
          updatedAt: now,
        });

        return {
          status: updatedStatus,
          processedInThisChunk: chunkProcessed,
          failedInThisChunk: chunkFailed,
          currentChunkIndex: nextChunk,
          totalChunks: jobData.totalChunks,
          processedCount: newTotalProcessed,
          failedCount: newTotalFailed,
          isFinished,
        };
      });

      return {
        success: true,
        jobId,
        ...result,
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);

/**
 * Retrieves the current status, progress, and error details of a variant matrix job.
 */
export const getVariantMatrixJobStatus = onCall(
  { region: 'asia-south1' },
  async (request: CallableRequest<{ organizationId: string; jobId: string }>) => {
    try {
      const { organizationId, jobId } = request.data || {};
      if (!organizationId || !jobId) {
        throw new ValidationError('organizationId and jobId are required');
      }

      await requireRole(request, organizationId, [...CATALOG_ALLOWED_ROLES]);

      const jobDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('variantJobs')
        .doc(jobId)
        .get();

      if (!jobDoc.exists) {
        throw new NotFoundError(`Job '${jobId}' not found`);
      }

      const data = jobDoc.data()!;
      return {
        success: true,
        job: {
          id: data.id,
          organizationId: data.organizationId,
          productId: data.productId,
          productCode: data.productCode,
          status: data.status,
          totalCombinations: data.totalCombinations,
          processedCount: data.processedCount,
          failedCount: data.failedCount,
          currentChunkIndex: data.currentChunkIndex,
          totalChunks: data.totalChunks,
          chunkSize: data.chunkSize,
          fencingToken: data.fencingToken,
          leaseWorkerId: data.leaseWorkerId,
          leaseExpiresAt: data.leaseExpiresAt?.toDate?.()?.toISOString() || null,
          errors: data.errors || [],
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
        },
      };
    } catch (error) {
      handleFunctionError(error);
    }
  }
);
