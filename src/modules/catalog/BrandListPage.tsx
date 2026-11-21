import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Tag, Plus, Archive, AlertCircle, CheckCircle2, Building2, Mail, Phone } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchBrands,
  saveBrand,
  archiveBrand,
} from '../../services/catalogService';
import {
  UpsertBrandInputSchema,
  type UpsertBrandInput,
  type BrandDocument,
} from '../../types/catalog';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';

export function BrandListPage(): JSX.Element {
  const queryClient = useQueryClient();
  const currentOrg = useAuthStore((state) => state.activeOrganization);
  const orgId = currentOrg?.id || '';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<BrandDocument | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Fetch Brands
  const { data: brands = [], isLoading } = useQuery({
    queryKey: ['brands', orgId],
    queryFn: () => fetchBrands(orgId),
    enabled: !!orgId,
  });

  // 2. React Hook Form Setup
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpsertBrandInput>({
    resolver: zodResolver(UpsertBrandInputSchema),
    defaultValues: {
      organizationId: orgId,
      name: '',
      code: '',
      logoUrl: '',
      description: '',
      manufacturerName: '',
      supportEmail: '',
      supportPhone: '',
      status: 'ACTIVE',
    },
  });

  // 3. Mutations
  const saveMutation = useMutation({
    mutationFn: saveBrand,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands', orgId] });
      setIsModalOpen(false);
      reset();
      setActionSuccess('Brand saved successfully');
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to save brand');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ brandId }: { brandId: string }) => archiveBrand(orgId, brandId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands', orgId] });
      setActionSuccess('Brand archived successfully');
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to archive brand');
    },
  });

  const handleOpenAdd = () => {
    setEditingBrand(null);
    reset({
      organizationId: orgId,
      name: '',
      code: '',
      logoUrl: '',
      description: '',
      manufacturerName: '',
      supportEmail: '',
      supportPhone: '',
      status: 'ACTIVE',
    });
    setActionError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (brand: BrandDocument) => {
    setEditingBrand(brand);
    reset({
      organizationId: orgId,
      id: brand.id,
      name: brand.name,
      code: brand.code,
      logoUrl: brand.logoUrl || '',
      description: brand.description || '',
      manufacturerName: brand.manufacturerName || '',
      supportEmail: brand.supportEmail || '',
      supportPhone: brand.supportPhone || '',
      status: brand.status,
    });
    setActionError(null);
    setIsModalOpen(true);
  };

  const onSubmit = (formData: UpsertBrandInput) => {
    setActionError(null);
    saveMutation.mutate(formData);
  };

  const filteredBrands = brands.filter(
    (b) =>
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-500">
        Please select an active organization to manage brands.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Tag className="h-6 w-6 text-brand-600" />
            Brands Directory
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage manufacturer brands, codes, and product label grouping across your stores.
          </p>
        </div>
        <Button onClick={handleOpenAdd} className="flex items-center gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" />
          Add Brand
        </Button>
      </div>

      {/* Success & Error Banners */}
      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="max-w-md">
        <Input
          placeholder="Search brands by name or code..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Loading & Empty States */}
      {isLoading && (
        <div className="py-12 text-center text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto mb-3" />
          Loading organization brands...
        </div>
      )}

      {!isLoading && brands.length === 0 && (
        <Card className="p-12 text-center">
          <Tag className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No brands registered yet</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            Register your manufacturers and retail brands to categorize items and print barcodes.
          </p>
          <Button onClick={handleOpenAdd} className="mt-4">
            <Plus className="h-4 w-4 mr-1.5" />
            Register Brand
          </Button>
        </Card>
      )}

      {/* Brands Grid */}
      {!isLoading && filteredBrands.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBrands.map((brand) => (
            <Card key={brand.id} className="p-5 flex flex-col justify-between border border-slate-200 shadow-sm hover:border-slate-300 transition-colors">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {brand.logoUrl ? (
                      <img src={brand.logoUrl} alt={brand.name} className="h-10 w-10 object-contain rounded border border-slate-100" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm">
                        {brand.code.substring(0, 3)}
                      </div>
                    )}
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{brand.name}</h3>
                      <span className="font-mono text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                        {brand.code}
                      </span>
                    </div>
                  </div>
                  <Badge variant={brand.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {brand.status}
                  </Badge>
                </div>

                {brand.description && (
                  <p className="text-xs text-slate-500 mt-3 line-clamp-2">{brand.description}</p>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1 text-xs text-slate-500">
                  {brand.manufacturerName && (
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      <span>{brand.manufacturerName}</span>
                    </div>
                  )}
                  {brand.supportEmail && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      <span>{brand.supportEmail}</span>
                    </div>
                  )}
                  {brand.supportPhone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <span>{brand.supportPhone}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => handleOpenEdit(brand)}
                  className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                >
                  Edit Brand
                </button>
                {brand.status === 'ACTIVE' && (
                  <button
                    onClick={() => archiveMutation.mutate({ brandId: brand.id })}
                    disabled={archiveMutation.isPending}
                    className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1"
                    title="Archive Brand"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Brand Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBrand ? 'Edit Brand' : 'Register Brand'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Brand Name"
            placeholder="e.g. Havells, Nike, or Tata"
            {...register('name')}
            error={errors.name?.message}
            required
          />

          <Input
            label="Brand Code (Unique)"
            placeholder="e.g. HVL"
            {...register('code')}
            error={errors.code?.message}
            helperText="Uppercase alphanumeric letters used for SKU generation."
            required
          />

          <Input
            label="Logo Image URL (Optional)"
            placeholder="https://cdn.example.com/logo.png"
            {...register('logoUrl')}
            error={errors.logoUrl?.message}
          />

          <Input
            label="Description (Optional)"
            placeholder="Overview of this brand"
            {...register('description')}
            error={errors.description?.message}
          />

          <Input
            label="Manufacturer / Parent Company"
            placeholder="e.g. Havells India Limited"
            {...register('manufacturerName')}
            error={errors.manufacturerName?.message}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Support Email"
              type="email"
              placeholder="support@brand.com"
              {...register('supportEmail')}
              error={errors.supportEmail?.message}
            />
            <Input
              label="Support Phone"
              placeholder="+91..."
              {...register('supportPhone')}
              error={errors.supportPhone?.message}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save Brand'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
