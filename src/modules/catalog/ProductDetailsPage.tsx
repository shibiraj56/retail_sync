import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Package,
  Layers,
  Scale,
  Receipt,
  ArrowLeft,
  Edit2,
  Archive,
  Check,
  X,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Tag,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchProductById,
  setProductStatus,
  archiveProduct,
} from '../../services/catalogService';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { VariantMatrixManager } from './components/VariantMatrixManager';

export function ProductDetailsPage(): JSX.Element {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentOrg = useAuthStore((state) => state.activeOrganization);
  const orgId = currentOrg?.id || '';

  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [mainTab, setMainTab] = useState<'overview' | 'variants'>('overview');

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', orgId, productId],
    queryFn: () => (productId ? fetchProductById(orgId, productId) : null),
    enabled: !!orgId && !!productId,
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: 'ACTIVE' | 'INACTIVE') =>
      setProductStatus(orgId, productId!, newStatus),
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ['product', orgId, productId] });
      queryClient.invalidateQueries({ queryKey: ['products', orgId] });
      setActionSuccess(`Product status changed to ${newStatus}`);
      setTimeout(() => setActionSuccess(null), 3500);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to update product status');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveProduct(orgId, productId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', orgId] });
      setIsArchiveModalOpen(false);
      navigate('/catalog/products');
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to archive product');
      setIsArchiveModalOpen(false);
    },
  });

  if (isLoading) {
    return (
      <div className="py-24 text-center text-xs text-slate-500">
        Loading product profile...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="py-24 text-center space-y-3">
        <Package className="w-12 h-12 text-slate-300 mx-auto" />
        <h2 className="text-base font-bold text-slate-800">Product Not Found</h2>
        <p className="text-xs text-slate-500">The product you requested does not exist or has been removed.</p>
        <Link to="/catalog/products">
          <Button variant="secondary" size="sm">
            &larr; Return to Products List
          </Button>
        </Link>
      </div>
    );
  }

  const primaryImage =
    product.images?.[selectedImageIndex] ||
    product.images?.find((img) => img.isPrimary) ||
    product.images?.[0];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Notifications */}
      {actionSuccess && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/catalog/products">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Products
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{product.name}</h1>
              {product.status === 'ACTIVE' && <Badge variant="success">Active</Badge>}
              {product.status === 'INACTIVE' && <Badge variant="amber">Inactive</Badge>}
              {product.status === 'ARCHIVED' && <Badge variant="neutral">Archived</Badge>}
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5 uppercase tracking-wide">
              SKU: {product.code}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {product.status !== 'ARCHIVED' && (
            <>
              <Link to={`/catalog/products/${product.id}/edit`}>
                <Button variant="secondary" size="sm">
                  <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                  Edit
                </Button>
              </Link>

              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  statusMutation.mutate(product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')
                }
                disabled={statusMutation.isPending}
              >
                {product.status === 'ACTIVE' ? (
                  <>
                    <X className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                    Activate
                  </>
                )}
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsArchiveModalOpen(true)}
              >
                <Archive className="w-3.5 h-3.5 mr-1.5 text-rose-500" />
                Archive
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          type="button"
          onClick={() => setMainTab('overview')}
          className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors ${
            mainTab === 'overview'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Product Overview & Specifications
        </button>
        <button
          type="button"
          onClick={() => setMainTab('variants')}
          className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            mainTab === 'variants'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Matrix Variants & Identifiers
        </button>
      </div>

      {mainTab === 'overview' ? (
        /* Main Grid */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Image Showcase */}
        <div className="md:col-span-1 space-y-4">
          <Card className="p-4 space-y-3">
            <div className="w-full h-64 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
              {primaryImage ? (
                <img
                  src={primaryImage.url}
                  alt={product.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-4">
                  <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No image uploaded</p>
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {product.images && product.images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {product.images.map((img, idx) => (
                  <button
                    key={img.storagePath || idx}
                    type="button"
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`h-16 rounded border overflow-hidden transition-all ${
                      selectedImageIndex === idx
                        ? 'border-brand-600 ring-2 ring-brand-200'
                        : 'border-slate-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Quick Specifications */}
          <Card className="p-4 space-y-3 text-xs">
            <h3 className="font-semibold text-slate-800 uppercase tracking-wider text-3xs border-b border-slate-100 pb-2">
              System Audit Snapshot
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-slate-600">
                <span>Created At:</span>
                <span className="font-mono text-3xs text-slate-800">
                  {new Date(product.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Last Updated:</span>
                <span className="font-mono text-3xs text-slate-800">
                  {new Date(product.updatedAt).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Organization ID:</span>
                <span className="font-mono text-3xs text-slate-800 truncate max-w-[120px]">
                  {product.organizationId}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Product ID:</span>
                <span className="font-mono text-3xs text-slate-800 truncate max-w-[120px]">
                  {product.id}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Detailed Sections */}
        <div className="md:col-span-2 space-y-4">
          {/* Identity & Description */}
          <Card className="p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Product Overview
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {product.description || (
                <span className="italic text-slate-400">No product description provided.</span>
              )}
            </p>
          </Card>

          {/* Classification & Category Snapshot */}
          <Card className="p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand-600" />
              Catalog Hierarchy Snapshot
            </h2>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Primary Category
                </span>
                <span className="text-sm font-bold text-slate-800 mt-1 block">
                  {product.categorySnapshot?.name || 'Unassigned'}
                </span>
                <span className="text-3xs font-mono text-slate-500">
                  Code: {product.categorySnapshot?.code || 'N/A'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Brand Association
                </span>
                <span className="text-sm font-bold text-slate-800 mt-1 block">
                  {product.brandSnapshot?.name || 'Generic / Unbranded'}
                </span>
                {product.brandSnapshot && (
                  <span className="text-3xs font-mono text-slate-500">
                    Code: {product.brandSnapshot.code}
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* Units of Measure */}
          <Card className="p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <Scale className="w-4 h-4 text-brand-600" />
              Units of Measure & Conversions
            </h2>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Base Inventory Unit
                </span>
                <span className="text-sm font-bold text-slate-800 mt-1 block">
                  {product.baseUomSnapshot?.name} ({product.baseUomSnapshot?.symbol})
                </span>
                <span className="text-3xs text-slate-500">
                  Decimals: {product.baseUomSnapshot?.allowDecimals ? `Up to ${product.baseUomSnapshot?.decimalPrecision} places` : 'No (Discrete integers only)'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Packaging / Secondary Unit
                </span>
                {product.secondaryUomSnapshot ? (
                  <>
                    <span className="text-sm font-bold text-slate-800 mt-1 block">
                      {product.secondaryUomSnapshot.name} ({product.secondaryUomSnapshot.symbol})
                    </span>
                    <span className="text-3xs font-semibold text-brand-600">
                      1 {product.secondaryUomSnapshot.symbol} = {product.uomConversionFactor}{' '}
                      {product.baseUomSnapshot?.symbol}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-400 italic block mt-1">
                    No secondary packaging defined
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* Tax Compliance & Pricing Rules */}
          <Card className="p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-brand-600" />
              Tax Compliance & Pricing Policy
            </h2>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-lg">
                <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider block">
                  HSN / SAC Code
                </span>
                <span className="text-sm font-mono font-bold text-slate-800 mt-0.5 block">
                  {product.taxData.code} ({product.taxData.codeType})
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg">
                <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider block">
                  GST Rate
                </span>
                <span className="text-sm font-bold text-slate-800 mt-0.5 block">
                  {product.taxData.taxRatePercent}% ({product.taxData.taxSlabId})
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg">
                <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Retail Pricing
                </span>
                <span className="text-xs font-semibold text-slate-800 mt-0.5 block">
                  {product.taxData.pricingType === 'TAX_INCLUSIVE' ? 'Tax-Inclusive (MRP)' : 'Tax-Exclusive (Plus GST)'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <ShieldCheck className="w-4 h-4 text-brand-600" />
                <span>
                  MRP Enforced:{' '}
                  <strong>{product.pricingPolicy?.requiresMrp ? 'Yes' : 'No'}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Tag className="w-4 h-4 text-brand-600" />
                <span>
                  Wholesale Allowed:{' '}
                  <strong>{product.pricingPolicy?.allowWholesale ? 'Yes' : 'No'}</strong>
                </span>
              </div>
            </div>
          </Card>

          {/* Tracking Flags */}
          <Card className="p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Traceability & Serial Tracking
            </h2>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800 block">Batch Tracking</span>
                  <span className="text-3xs text-slate-500">Track lots, batches and expiration</span>
                </div>
                <Badge variant={product.trackingFlags?.trackBatches ? 'brand' : 'neutral'}>
                  {product.trackingFlags?.trackBatches ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800 block">Serial Number Tracking</span>
                  <span className="text-3xs text-slate-500">Individual serial barcodes per item</span>
                </div>
                <Badge variant={product.trackingFlags?.trackSerials ? 'purple' : 'neutral'}>
                  {product.trackingFlags?.trackSerials ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>
      ) : (
        <Card className="p-6">
          <VariantMatrixManager organizationId={orgId} product={product} />
        </Card>
      )}

      {/* Archive Modal */}
      {isArchiveModalOpen && (
        <Modal
          isOpen={isArchiveModalOpen}
          onClose={() => setIsArchiveModalOpen(false)}
          title="Confirm Product Archival"
        >
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs space-y-1">
              <p className="font-semibold">Are you sure you want to archive this product?</p>
              <p>
                Product: <span className="font-bold">{product.name}</span> ({product.code})
              </p>
              <p>
                Once archived, this product will be hidden from new purchase orders and POS sales. Its code will
                remain reserved in the organization registry.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setIsArchiveModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-rose-600 hover:bg-rose-700"
                onClick={() => archiveMutation.mutate()}
                disabled={archiveMutation.isPending}
              >
                {archiveMutation.isPending ? 'Archiving...' : 'Confirm Archival'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default ProductDetailsPage;
