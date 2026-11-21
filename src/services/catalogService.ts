import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, getDoc, doc, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, functions, storage } from '../config/firebase';
import type {
  CategoryDocument,
  UpsertCategoryInput,
  BrandDocument,
  UpsertBrandInput,
  UnitOfMeasureDocument,
  UpsertUomInput,
  ProductDocument,
  UpsertProductInput,
  ProductImage,
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

// ============================================================================
// 4. PRODUCT MASTER SERVICE
// ============================================================================

export async function fetchProducts(
  organizationId: string
): Promise<ProductDocument[]> {
  const productsRef = collection(db, 'organizations', organizationId, 'products');
  const q = query(productsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      ...data,
      id: docSnap.id,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
    } as ProductDocument;
  });
}

export async function fetchProductById(
  organizationId: string,
  productId: string
): Promise<ProductDocument | null> {
  const productRef = doc(db, 'organizations', organizationId, 'products', productId);
  const snapshot = await getDoc(productRef);
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    ...data,
    id: snapshot.id,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
  } as ProductDocument;
}

export async function saveProduct(input: UpsertProductInput): Promise<{ productId: string }> {
  const callUpsert = httpsCallable<UpsertProductInput, { success: boolean; productId: string }>(
    functions,
    'upsertMasterProduct'
  );
  const result = await callUpsert(input);
  return { productId: result.data.productId };
}

export async function archiveProduct(organizationId: string, productId: string): Promise<void> {
  const callArchive = httpsCallable<{ organizationId: string; productId: string }, { success: boolean }>(
    functions,
    'archiveProduct'
  );
  await callArchive({ organizationId, productId });
}

export async function setProductStatus(
  organizationId: string,
  productId: string,
  status: 'ACTIVE' | 'INACTIVE'
): Promise<void> {
  const callSetStatus = httpsCallable<
    { organizationId: string; productId: string; status: 'ACTIVE' | 'INACTIVE' },
    { success: boolean }
  >(functions, 'setProductStatus');
  await callSetStatus({ organizationId, productId, status });
}

export async function uploadProductImage(
  organizationId: string,
  productId: string,
  file: File,
  isPrimary: boolean = false
): Promise<ProductImage> {
  const fileExt = file.name.split('.').pop() || 'jpg';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const storagePath = `organizations/${organizationId}/products/${productId}/${fileName}`;
  const fileRef = ref(storage, storagePath);

  await uploadBytes(fileRef, file, {
    contentType: file.type,
    customMetadata: { organizationId, productId },
  });

  const url = await getDownloadURL(fileRef);
  return {
    url,
    storagePath,
    isPrimary,
  };
}

