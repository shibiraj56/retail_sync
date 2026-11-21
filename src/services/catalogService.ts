import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db, functions } from '../config/firebase';
import type {
  CategoryDocument,
  UpsertCategoryInput,
  BrandDocument,
  UpsertBrandInput,
  UnitOfMeasureDocument,
  UpsertUomInput,
} from '../types/catalog';

// ============================================================================
// 1. CATEGORIES SERVICE
// ============================================================================

export async function fetchCategories(organizationId: string): Promise<CategoryDocument[]> {
  const categoriesRef = collection(db, 'organizations', organizationId, 'categories');
  const q = query(categoriesRef, orderBy('displayOrder', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
    } as CategoryDocument;
  });
}

export async function saveCategory(input: UpsertCategoryInput): Promise<{ categoryId: string }> {
  const callUpsert = httpsCallable<UpsertCategoryInput, { success: boolean; categoryId: string }>(
    functions,
    'upsertCategory'
  );
  const result = await callUpsert(input);
  return { categoryId: result.data.categoryId };
}

export async function archiveCategory(organizationId: string, categoryId: string): Promise<void> {
  const callArchive = httpsCallable<{ organizationId: string; categoryId: string }, { success: boolean }>(
    functions,
    'archiveCategory'
  );
  await callArchive({ organizationId, categoryId });
}

// ============================================================================
// 2. BRANDS SERVICE
// ============================================================================

export async function fetchBrands(organizationId: string): Promise<BrandDocument[]> {
  const brandsRef = collection(db, 'organizations', organizationId, 'brands');
  const q = query(brandsRef, orderBy('name', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
    } as BrandDocument;
  });
}

export async function saveBrand(input: UpsertBrandInput): Promise<{ brandId: string }> {
  const callUpsert = httpsCallable<UpsertBrandInput, { success: boolean; brandId: string }>(
    functions,
    'upsertBrand'
  );
  const result = await callUpsert(input);
  return { brandId: result.data.brandId };
}

export async function archiveBrand(organizationId: string, brandId: string): Promise<void> {
  const callArchive = httpsCallable<{ organizationId: string; brandId: string }, { success: boolean }>(
    functions,
    'archiveBrand'
  );
  await callArchive({ organizationId, brandId });
}

// ============================================================================
// 3. UNITS OF MEASURE SERVICE
// ============================================================================

export async function fetchUnitsOfMeasure(organizationId: string): Promise<UnitOfMeasureDocument[]> {
  const uomRef = collection(db, 'organizations', organizationId, 'unitsOfMeasure');
  const q = query(uomRef, orderBy('name', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
    } as UnitOfMeasureDocument;
  });
}

export async function saveUnitOfMeasure(input: UpsertUomInput): Promise<{ uomId: string }> {
  const callUpsert = httpsCallable<UpsertUomInput, { success: boolean; uomId: string }>(
    functions,
    'upsertUnitOfMeasure'
  );
  const result = await callUpsert(input);
  return { uomId: result.data.uomId };
}

export async function seedDefaultUnits(organizationId: string): Promise<number> {
  const callSeed = httpsCallable<{ organizationId: string }, { success: boolean; count: number }>(
    functions,
    'seedDefaultUnitsOfMeasure'
  );
  const result = await callSeed({ organizationId });
  return result.data.count;
}

export async function archiveUnitOfMeasure(organizationId: string, uomId: string): Promise<void> {
  const callArchive = httpsCallable<{ organizationId: string; uomId: string }, { success: boolean }>(
    functions,
    'archiveUnitOfMeasure'
  );
  await callArchive({ organizationId, uomId });
}
