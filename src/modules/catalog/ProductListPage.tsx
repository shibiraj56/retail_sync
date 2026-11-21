import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Archive,
  Eye,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchProducts,
  fetchCategories,
  fetchBrands,
  archiveProduct,
  setProductStatus,
} from '../../services/catalogService';
import type { ProductDocument } from '../../types/catalog';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';

export function ProductListPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentOrg = useAuthStore((state) => state.activeOrganization);
  const orgId = currentOrg?.id || '';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const [archivingProduct, setArchivingProduct] = useState<ProductDocument | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Queries
  const { data: products = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products', orgId],
    queryFn: () => fetchProducts(orgId),
    enabled: !!orgId,
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

  // Mutations
  const statusMutation = useMutation({
    mutationFn: ({ productId, status }: { productId: string; status: 'ACTIVE' | 'INACTIVE' }) =>
      setProductStatus(orgId, productId, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products', orgId] });
      setActionSuccess(`Product status changed to ${variables.status}`);
      setTimeout(() => setActionSuccess(null), 3500);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to update product status');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (productId: string) => archiveProduct(orgId, productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', orgId] });
      setActionSuccess('Product archived successfully');
      setArchivingProduct(null);
      setTimeout(() => setActionSuccess(null), 3500);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to archive product');
      setArchivingProduct(null);
    },
  });

  // Filtering
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      // Search
      const searchMatch =
        !searchTerm.trim() ||
        prod.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        prod.code.toLowerCase().includes(searchTerm.toLowerCase());

      // Category
      const catMatch = selectedCategory === 'ALL' || prod.categoryId === selectedCategory;

      // Brand
      const brandMatch = selectedBrand === 'ALL' || prod.brandId === selectedBrand;

      // Status
      const statusMatch = selectedStatus === 'ALL' || prod.status === selectedStatus;

      return searchMatch && catMatch && brandMatch && statusMatch;
    });
  }, [products, searchTerm, selectedCategory, selectedBrand, selectedStatus]);

  const activeCount = useMemo(() => products.filter((p) => p.status === 'ACTIVE').length, [products]);
  const inactiveCount = useMemo(() => products.filter((p) => p.status === 'INACTIVE').length, [products]);
  const archivedCount = useMemo(() => products.filter((p) => p.status === 'ARCHIVED').length, [products]);

  return (
    <div className="space-y-6">
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-brand-600" />
            Product Master
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Central repository for base catalog items, classification, units of measure, and tax rules.
          </p>
        </div>
        <Link to="/catalog/products/new">
          <Button variant="primary" size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Add New Product
          </Button>
        </Link>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Products</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{products.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Active</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{activeCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Inactive</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{inactiveCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Archived</p>
          <p className="text-2xl font-bold text-slate-600 mt-1">{archivedCount}</p>
        </Card>
      </div>

      {/* Filters Toolbar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <Input
              placeholder="Search by name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* Brand Filter */}
          <div>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="ALL">All Brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
              <option value="ARCHIVED">Archived Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Product Table */}
      <Card className="overflow-hidden">
        {isLoadingProducts ? (
          <div className="py-16 text-center text-xs text-slate-500">Loading master products...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No products found</p>
            <p className="text-xs text-slate-400 mt-1">
              {searchTerm || selectedCategory !== 'ALL' || selectedBrand !== 'ALL' || selectedStatus !== 'ALL'
                ? 'Try adjusting your filters or search term'
                : 'Get started by creating your first catalog product'}
            </p>
            <div className="mt-4">
              <Link to="/catalog/products/new">
                <Button variant="primary" size="sm">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Product
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-3xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">Classification</th>
                  <th className="py-3 px-4">Units</th>
                  <th className="py-3 px-4">Tax & HSN</th>
                  <th className="py-3 px-4">Tracking</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredProducts.map((product) => {
                  const primaryImg = product.images?.find((img) => img.isPrimary) || product.images?.[0];

                  return (
                    <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Product Name & Code */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                            {primaryImg ? (
                              <img
                                src={primaryImg.url}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="w-5 h-5 text-slate-400" />
                            )}
                          </div>
                          <div>
                            <Link
                              to={`/catalog/products/${product.id}`}
                              className="font-semibold text-slate-900 hover:text-brand-600 transition-colors line-clamp-1"
                            >
                              {product.name}
                            </Link>
                            <span className="font-mono text-3xs text-slate-400 uppercase">
                              {product.code}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Classification */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <span className="inline-block px-1.5 py-0.5 rounded text-3xs font-medium bg-slate-100 text-slate-700">
                            {product.categorySnapshot?.name || 'Unassigned'}
                          </span>
                          {product.brandSnapshot && (
                            <p className="text-3xs text-slate-500 font-medium">
                              Brand: {product.brandSnapshot.name}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Units */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-800">
                            {product.baseUomSnapshot?.symbol || product.baseUomId}
                          </span>
                          {product.secondaryUomSnapshot && (
                            <p className="text-3xs text-slate-500">
                              1 {product.secondaryUomSnapshot.symbol} = {product.uomConversionFactor}{' '}
                              {product.baseUomSnapshot?.symbol}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Tax & HSN */}
                      <td className="py-3 px-4">
                        <div>
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {product.taxData.code}
                          </span>
                          <p className="text-3xs text-slate-500">
                            {product.taxData.taxRatePercent}% ({product.taxData.pricingType === 'TAX_INCLUSIVE' ? 'Inc.' : 'Exc.'})
                          </p>
                        </div>
                      </td>

                      {/* Tracking */}
                      <td className="py-3 px-4">
                        <div className="flex gap-1 flex-wrap">
                          {product.trackingFlags?.trackBatches && (
                            <Badge variant="brand" size="sm">
                              Batch
                            </Badge>
                          )}
                          {product.trackingFlags?.trackSerials && (
                            <Badge variant="purple" size="sm">
                              Serial
                            </Badge>
                          )}
                          {!product.trackingFlags?.trackBatches && !product.trackingFlags?.trackSerials && (
                            <span className="text-3xs text-slate-400">Standard</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {product.status === 'ACTIVE' && (
                          <Badge variant="success" size="sm">
                            Active
                          </Badge>
                        )}
                        {product.status === 'INACTIVE' && (
                          <Badge variant="amber" size="sm">
                            Inactive
                          </Badge>
                        )}
                        {product.status === 'ARCHIVED' && (
                          <Badge variant="neutral" size="sm">
                            Archived
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            title="View Details"
                            onClick={() => navigate(`/catalog/products/${product.id}`)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            title="Edit Product"
                            onClick={() => navigate(`/catalog/products/${product.id}/edit`)}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>

                          {product.status !== 'ARCHIVED' && (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                title={product.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                                onClick={() =>
                                  statusMutation.mutate({
                                    productId: product.id,
                                    status: product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                                  })
                                }
                              >
                                {product.status === 'ACTIVE' ? (
                                  <X className="w-3.5 h-3.5 text-amber-600" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                )}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                title="Archive Product"
                                onClick={() => setArchivingProduct(product)}
                              >
                                <Archive className="w-3.5 h-3.5 text-rose-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Archive Confirmation Modal */}
      {archivingProduct && (
        <Modal
          isOpen={!!archivingProduct}
          onClose={() => setArchivingProduct(null)}
          title="Archive Master Product"
        >
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs space-y-1">
              <p className="font-semibold">Are you sure you want to archive this product?</p>
              <p>
                Product: <span className="font-bold">{archivingProduct.name}</span> ({archivingProduct.code})
              </p>
              <p>
                Archiving will mark the product code as reserved/archived and hide this product from active
                inventory operations. Historical references remain intact.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setArchivingProduct(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-rose-600 hover:bg-rose-700"
                onClick={() => archiveMutation.mutate(archivingProduct.id)}
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
export default ProductListPage;
