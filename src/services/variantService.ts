import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db, functions } from '../config/firebase';
import type {
  ProductVariantDocument,
  VariantAxis,
  SaveVariantsSyncInput,
  CreateVariantMatrixJobInput,
  VariantMatrixJobDocument,
} from '../types/variants';

export async function fetchVariants(
  organizationId: string,
  productId: string
): Promise<ProductVariantDocument[]> {
  const variantsRef = collection(
    db,
    'organizations',
    organizationId,
    'products',
    productId,
    'variants'
  );
  const q = query(variantsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      ...data,
      id: docSnap.id,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
    } as ProductVariantDocument;
  });
}

export async function previewVariantMatrix(params: {
  organizationId: string;
  productId: string;
  axes: VariantAxis[];
  skuTemplate?: string;
}): Promise<{
  totalCombinations: number;
  productCode: string;
  variants: any[];
  orphanedVariants: any[];
}> {
  const callFn = httpsCallable<any, any>(functions, 'generateVariantMatrix');
  const result = await callFn(params);
  return result.data;
}

export async function saveVariantsSync(input: SaveVariantsSyncInput): Promise<{
  success: boolean;
  savedVariantsCount: number;
}> {
  const callFn = httpsCallable<SaveVariantsSyncInput, any>(functions, 'saveProductVariantsSync');
  const result = await callFn(input);
  return result.data;
}

export async function archiveVariant(
  organizationId: string,
  productId: string,
  variantId: string
): Promise<void> {
  const callFn = httpsCallable<any, any>(functions, 'archiveVariant');
  await callFn({ organizationId, productId, variantId });
}

export async function validateIdentifier(params: {
  organizationId: string;
  type: 'SKU' | 'BARCODE';
  value: string;
  excludeVariantId?: string;
}): Promise<{
  valid: boolean;
  available: boolean;
  type?: string;
  normalized?: string;
  error?: string;
}> {
  const callFn = httpsCallable<any, any>(functions, 'validateIdentifier');
  const result = await callFn(params);
  return result.data;
}

export async function createVariantMatrixJob(
  input: CreateVariantMatrixJobInput
): Promise<{
  jobId: string;
  totalCombinations: number;
  totalChunks: number;
  chunkSize: number;
  fencingToken: number;
}> {
  const callFn = httpsCallable<CreateVariantMatrixJobInput, any>(
    functions,
    'createVariantMatrixJob'
  );
  const result = await callFn(input);
  return result.data;
}

export async function acquireJobLease(params: {
  organizationId: string;
  jobId: string;
  workerId: string;
}): Promise<{
  fencingToken: number;
  currentChunkIndex: number;
  totalChunks: number;
  leaseExpiresAt: string;
}> {
  const callFn = httpsCallable<any, any>(functions, 'acquireJobLease');
  const result = await callFn(params);
  return result.data;
}

export async function processJobChunk(params: {
  organizationId: string;
  jobId: string;
  workerId: string;
  expectedFencingToken: number;
}): Promise<{
  status: string;
  currentChunkIndex: number;
  totalChunks: number;
  processedCount: number;
  failedCount: number;
  isFinished: boolean;
}> {
  const callFn = httpsCallable<any, any>(functions, 'processVariantMatrixJobChunk');
  const result = await callFn(params);
  return result.data;
}

export async function getJobStatus(
  organizationId: string,
  jobId: string
): Promise<VariantMatrixJobDocument> {
  const callFn = httpsCallable<any, any>(functions, 'getVariantMatrixJobStatus');
  const result = await callFn({ organizationId, jobId });
  return result.data.job;
}
