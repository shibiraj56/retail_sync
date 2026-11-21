import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Package,
  Layers,
  Scale,
  Receipt,
  Image as ImageIcon,
  ArrowLeft,
  Save,
  AlertCircle,
  CheckCircle2,
  UploadCloud,
  Trash2,
  Star,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchProductById,
  fetchCategories,
  fetchBrands,
  fetchUnitsOfMeasure,
  saveProduct,
  uploadProductImage,
} from '../../services/catalogService';
import {
  UpsertProductInputSchema,
  type UpsertProductInput,
} from '../../types/catalog';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';

const TAX_SLABS = [
  { id: 'GST_0', name: '0% (Nil / Exempt)', rate: 0 },
  { id: 'GST_5', name: '5% (Essential Commodities)', rate: 5 },
  { id: 'GST_12', name: '12% (Standard Lower)', rate: 12 },
  { id: 'GST_18', name: '18% (Standard General)', rate: 18 },
  { id: 'GST_28', name: '28% (Luxury / Demerit)', rate: 28 },
];

export function ProductCreateWizard(): JSX.Element {
  const navigate = useNavigate();
  const { productId } = useParams<{ productId?: string }>();
  const isEditMode = !!productId;

  const queryClient = useQueryClient();
  const currentOrg = useAuthStore((state) => state.activeOrganization);
  const orgId = currentOrg?.id || '';

  const [activeTab, setActiveTab] = useState<'basic' | 'classification' | 'units' | 'tax' | 'media'>(
    'basic'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Queries
  const { data: existingProduct, isLoading: isLoadingProduct } = useQuery({
    queryKey: ['product', orgId, productId],
    queryFn: () => (productId ? fetchProductById(orgId, productId) : null),
    enabled: !!orgId && !!productId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', orgId],
    queryFn: () => fetchCategories(orgId),
    enabled: !!orgId,
  });

  const { data: brands = [] } = useQuery({
    queryKey: ['brands', orgId],
    queryFn: () => fetchBrands(orgId),
    enabled: !!orgId,
  });

  const { data: units = [] } = useQuery({
    queryKey: ['unitsOfMeasure', orgId],
    queryFn: () => fetchUnitsOfMeasure(orgId),
    enabled: !!orgId,
  });

  // React Hook Form
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpsertProductInput>({
    resolver: zodResolver(UpsertProductInputSchema),
    defaultValues: {
      organizationId: orgId,
      name: '',
      code: '',
      description: '',
      categoryId: '',
      brandId: null,
      baseUomId: '',
      secondaryUomId: null,
      uomConversionFactor: null,
      taxData: {
        codeType: 'HSN',
        code: '1905',
        taxCategory: 'STANDARD',
        taxSlabId: 'GST_18',
        taxRatePercent: 18,
        pricingType: 'TAX_INCLUSIVE',
      },
      pricingPolicy: {
        requiresMrp: true,
        allowWholesale: false,
      },
      trackingFlags: {
        trackBatches: false,
        trackSerials: false,
      },
      images: [],
      status: 'ACTIVE',
    },
  });

  // Prepopulate in edit mode
  useEffect(() => {
    if (existingProduct) {
      reset({
        organizationId: orgId,
        id: existingProduct.id,
        name: existingProduct.name,
        code: existingProduct.code,
        description: existingProduct.description || '',
        categoryId: existingProduct.categoryId,
        brandId: existingProduct.brandId || null,
        baseUomId: existingProduct.baseUomId,
        secondaryUomId: existingProduct.secondaryUomId || null,
        uomConversionFactor: existingProduct.uomConversionFactor || null,
        taxData: {
          codeType: existingProduct.taxData.codeType,
          code: existingProduct.taxData.code,
          taxCategory: existingProduct.taxData.taxCategory,
          taxSlabId: existingProduct.taxData.taxSlabId,
          taxRatePercent: existingProduct.taxData.taxRatePercent,
          pricingType: existingProduct.taxData.pricingType,
        },
        pricingPolicy: {
          requiresMrp: existingProduct.pricingPolicy?.requiresMrp ?? true,
          allowWholesale: existingProduct.pricingPolicy?.allowWholesale ?? false,
        },
        trackingFlags: {
          trackBatches: existingProduct.trackingFlags?.trackBatches ?? false,
          trackSerials: existingProduct.trackingFlags?.trackSerials ?? false,
        },
        images: existingProduct.images || [],
        status: existingProduct.status,
      });
    }
  }, [existingProduct, orgId, reset]);

  // Form watchers for dynamic behavior
  const watchedImages = watch('images') || [];
  const watchedBaseUomId = watch('baseUomId');
  const watchedSecondaryUomId = watch('secondaryUomId');
  const watchedTaxSlabId = watch('taxData.taxSlabId');

  // Sync tax rate when slab changes
  const handleTaxSlabChange = (slabId: string) => {
    const slab = TAX_SLABS.find((s) => s.id === slabId);
    if (slab) {
      setValue('taxData.taxSlabId', slab.id);
      setValue('taxData.taxRatePercent', slab.rate);
    }
  };

  // Image Upload handler
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Image size must be less than 5MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Selected file must be an image (PNG, JPEG, WebP)');
      return;
    }

    try {
      setUploadingImage(true);
      setErrorMessage(null);
      const tempId = productId || `temp_${Date.now()}`;
      const isFirst = watchedImages.length === 0;
      const uploaded = await uploadProductImage(orgId, tempId, file, isFirst);

      setValue('images', [...watchedImages, uploaded]);
      setSuccessMessage('Image uploaded successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Image upload failed');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleSetPrimaryImage = (index: number) => {
    const updated = watchedImages.map((img, i) => ({
      ...img,
      isPrimary: i === index,
    }));
    setValue('images', updated);
  };

  const handleRemoveImage = (index: number) => {
    const updated = watchedImages.filter((_, i) => i !== index);
    if (updated.length > 0 && !updated.some((img) => img.isPrimary)) {
      updated[0].isPrimary = true;
    }
    setValue('images', updated);
  };

  // Mutation
  const saveMutation = useMutation({
    mutationFn: (data: UpsertProductInput) => saveProduct(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products', orgId] });
      queryClient.invalidateQueries({ queryKey: ['product', orgId, result.productId] });
      navigate(`/catalog/products/${result.productId}`);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to save product');
    },
  });

  const onSubmit = (data: UpsertProductInput) => {
    setErrorMessage(null);
    saveMutation.mutate(data);
  };

  const baseUomObj = units.find((u) => u.id === watchedBaseUomId);
  const secondaryUomObj = units.find((u) => u.id === watchedSecondaryUomId);

  if (isEditMode && isLoadingProduct) {
    return (
      <div className="py-24 text-center text-xs text-slate-500">
        Loading product details...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/catalog/products">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Package className="w-5 h-5 text-brand-600" />
              {isEditMode ? `Edit Product: ${existingProduct?.name}` : 'Create Master Product'}
            </h1>
            <p className="text-xs text-slate-500">
              {isEditMode
                ? 'Update master product classification, units, and tax compliance'
                : 'Define base specifications, classification, measurement units, and tax classification'}
            </p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Wizard Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-white rounded-t-lg px-2 pt-2 gap-1 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('basic')}
            className={`flex items-center gap-2 px-4 py-2.5 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'basic'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package className="w-4 h-4" />
            1. Identity
            {(errors.name || errors.code) && (
              <span className="w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('classification')}
            className={`flex items-center gap-2 px-4 py-2.5 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'classification'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            2. Classification
            {(errors.categoryId || errors.brandId) && (
              <span className="w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('units')}
            className={`flex items-center gap-2 px-4 py-2.5 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'units'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Scale className="w-4 h-4" />
            3. Units & Packaging
            {(errors.baseUomId || errors.secondaryUomId || errors.uomConversionFactor) && (
              <span className="w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tax')}
            className={`flex items-center gap-2 px-4 py-2.5 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'tax'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Receipt className="w-4 h-4" />
            4. Tax & Compliance
            {errors.taxData && <span className="w-2 h-2 rounded-full bg-rose-500" />}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`flex items-center gap-2 px-4 py-2.5 font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'media'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            5. Media & Tracking
          </button>
        </div>

        {/* Tab 1: Identity */}
        {activeTab === 'basic' && (
          <Card className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Product Identity & Naming
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Name <span className="text-rose-500">*</span>
                </label>
                <Input
                  placeholder="e.g. Basmati Rice 5kg, Anchor Modular Switch"
                  {...register('name')}
                  error={errors.name?.message}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Code <span className="text-rose-500">*</span>
                </label>
                <Input
                  placeholder="e.g. PROD-RICE-5KG, ELEC-SW-01"
                  {...register('code')}
                  disabled={isEditMode}
                  error={errors.code?.message}
                  className="uppercase font-mono text-xs"
                />
                <p className="text-3xs text-slate-400 mt-1">
                  Unique SKU identifier within organization. Cannot contain special characters except dashes/underscores.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description
              </label>
              <textarea
                rows={4}
                placeholder="Detailed product specifications, notes, manufacturer details..."
                {...register('description')}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {errors.description && (
                <p className="text-xs text-rose-500 mt-1">{errors.description.message}</p>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <Button type="button" variant="primary" size="sm" onClick={() => setActiveTab('classification')}>
                Next: Classification &rarr;
              </Button>
            </div>
          </Card>
        )}

        {/* Tab 2: Classification */}
        {activeTab === 'classification' && (
          <Card className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Catalog Hierarchy & Brand Association
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category <span className="text-rose-500">*</span>
                </label>
                <select
                  {...register('categoryId')}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select Category...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
                {errors.categoryId && (
                  <p className="text-xs text-rose-500 mt-1">{errors.categoryId.message}</p>
                )}
                <p className="text-3xs text-slate-400 mt-1">
                  Inherits GST tax slabs and HSN classification if left blank.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Brand (Optional)
                </label>
                <select
                  {...register('brandId')}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">No Brand (Generic / Store Brand)</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
                {errors.brandId && (
                  <p className="text-xs text-rose-500 mt-1">{errors.brandId.message}</p>
                )}
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button type="button" variant="secondary" size="sm" onClick={() => setActiveTab('basic')}>
                &larr; Back
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={() => setActiveTab('units')}>
                Next: Units of Measure &rarr;
              </Button>
            </div>
          </Card>
        )}

        {/* Tab 3: Units & Packaging */}
        {activeTab === 'units' && (
          <Card className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Units of Measure & Packaging Rules
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Base Unit of Measure <span className="text-rose-500">*</span>
                </label>
                <select
                  {...register('baseUomId')}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select Base Unit...</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.symbol}) — {u.type}
                    </option>
                  ))}
                </select>
                {errors.baseUomId && (
                  <p className="text-xs text-rose-500 mt-1">{errors.baseUomId.message}</p>
                )}
                <p className="text-3xs text-slate-400 mt-1">
                  All inventory balances and ledger movements are tracked in this unit.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Secondary Unit (Packaging / Outer)
                </label>
                <select
                  {...register('secondaryUomId')}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">None (Single unit tracking only)</option>
                  {units
                    .filter((u) => u.id !== watchedBaseUomId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.symbol}) — {u.type}
                      </option>
                    ))}
                </select>
                {errors.secondaryUomId && (
                  <p className="text-xs text-rose-500 mt-1">{errors.secondaryUomId.message}</p>
                )}
              </div>
            </div>

            {watchedSecondaryUomId && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <label className="block text-xs font-semibold text-slate-800">
                  Packaging Conversion Ratio <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                    1 {secondaryUomObj?.symbol || 'Secondary'} =
                  </span>
                  <Input
                    type="number"
                    step="0.0001"
                    placeholder="e.g. 24, 10, 50"
                    {...register('uomConversionFactor', { valueAsNumber: true })}
                    className="w-32 text-xs"
                    error={errors.uomConversionFactor?.message}
                  />
                  <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                    {baseUomObj?.symbol || 'Base Unit(s)'}
                  </span>
                </div>
                <p className="text-3xs text-slate-500">
                  Example: 1 BOX = 24 PCS. Enables purchasing by wholesale box while selling by individual pieces.
                </p>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button type="button" variant="secondary" size="sm" onClick={() => setActiveTab('classification')}>
                &larr; Back
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={() => setActiveTab('tax')}>
                Next: Tax & Compliance &rarr;
              </Button>
            </div>
          </Card>
        )}

        {/* Tab 4: Tax & Compliance */}
        {activeTab === 'tax' && (
          <Card className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              GST / Tax Classification & Pricing Policy
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Code Type <span className="text-rose-500">*</span>
                </label>
                <select
                  {...register('taxData.codeType')}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="HSN">HSN (Goods)</option>
                  <option value="SAC">SAC (Services)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  HSN / SAC Code <span className="text-rose-500">*</span>
                </label>
                <Input
                  placeholder="e.g. 1905, 8536"
                  {...register('taxData.code')}
                  error={errors.taxData?.code?.message}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tax Category
                </label>
                <select
                  {...register('taxData.taxCategory')}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="STANDARD">Standard Rated</option>
                  <option value="EXEMPT">Exempt</option>
                  <option value="ZERO_RATED">Zero Rated</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  GST Tax Slab <span className="text-rose-500">*</span>
                </label>
                <select
                  value={watchedTaxSlabId}
                  onChange={(e) => handleTaxSlabChange(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {TAX_SLABS.map((slab) => (
                    <option key={slab.id} value={slab.id}>
                      {slab.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tax Rate (%)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  {...register('taxData.taxRatePercent', { valueAsNumber: true })}
                  error={errors.taxData?.taxRatePercent?.message}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Retail Pricing Policy
                </label>
                <select
                  {...register('taxData.pricingType')}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="TAX_INCLUSIVE">Tax Inclusive (MRP includes GST)</option>
                  <option value="TAX_EXCLUSIVE">Tax Exclusive (GST added at POS checkout)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('pricingPolicy.requiresMrp')}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Enforce Maximum Retail Price (MRP) constraint during sale</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('pricingPolicy.allowWholesale')}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Allow B2B Wholesale Pricing & Tiers</span>
              </label>
            </div>

            <div className="flex justify-between pt-4">
              <Button type="button" variant="secondary" size="sm" onClick={() => setActiveTab('units')}>
                &larr; Back
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={() => setActiveTab('media')}>
                Next: Media & Tracking &rarr;
              </Button>
            </div>
          </Card>
        )}

        {/* Tab 5: Media & Tracking */}
        {activeTab === 'media' && (
          <Card className="p-6 space-y-6">
            <div>
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Inventory Tracking & Traceability
              </h2>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    {...register('trackingFlags.trackBatches')}
                    className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div>
                    <span className="text-xs font-semibold text-slate-800 block">Batch / Lot Tracking</span>
                    <span className="text-3xs text-slate-500">
                      Track manufacturing batch numbers and expiry dates (grocery, pharmaceuticals).
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    {...register('trackingFlags.trackSerials')}
                    className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div>
                    <span className="text-xs font-semibold text-slate-800 block">Serial Number Tracking</span>
                    <span className="text-3xs text-slate-500">
                      Track unique serial numbers per piece (electronics, mobile phones, appliances).
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Product Images
              </h2>
              <p className="text-xs text-slate-500 mt-1 mb-3">
                Upload up to 5MB PNG, JPEG, or WebP images. Stored securely in Firebase Cloud Storage.
              </p>

              {/* Upload Input */}
              <div className="flex items-center gap-3">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    disabled={uploadingImage}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 hover:border-slate-400 rounded-lg text-xs font-semibold text-slate-700 shadow-xs transition-colors">
                    <UploadCloud className="w-4 h-4 text-brand-600" />
                    <span>{uploadingImage ? 'Uploading Image...' : 'Choose Image File'}</span>
                  </div>
                </label>
                <span className="text-3xs text-slate-400">Max file size 5MB</span>
              </div>

              {/* Uploaded Images List */}
              {watchedImages.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {watchedImages.map((img, idx) => (
                    <div
                      key={img.storagePath || idx}
                      className={`relative group rounded-lg border overflow-hidden bg-slate-50 ${
                        img.isPrimary ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200'
                      }`}
                    >
                      <img src={img.url} alt="Product" className="w-full h-28 object-cover" />
                      <div className="p-2 flex items-center justify-between bg-white text-xs">
                        <button
                          type="button"
                          onClick={() => handleSetPrimaryImage(idx)}
                          className={`flex items-center gap-1 text-3xs font-semibold ${
                            img.isPrimary ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          <Star className={`w-3 h-3 ${img.isPrimary ? 'fill-brand-600' : ''}`} />
                          {img.isPrimary ? 'Primary' : 'Set Primary'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4">
              <Button type="button" variant="secondary" size="sm" onClick={() => setActiveTab('tax')}>
                &larr; Back
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmitting || saveMutation.isPending || uploadingImage}
              >
                <Save className="w-4 h-4 mr-1.5" />
                {saveMutation.isPending ? 'Saving Product...' : isEditMode ? 'Update Product' : 'Create Product'}
              </Button>
            </div>
          </Card>
        )}
      </form>
    </div>
  );
}
export default ProductCreateWizard;
