import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FolderTree, Plus, Archive, AlertCircle, CheckCircle2, ChevronRight, Layers } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchCategories,
  saveCategory,
  archiveCategory,
} from '../../services/catalogService';
import {
  UpsertCategoryInputSchema,
  type UpsertCategoryInput,
  type CategoryDocument,
} from '../../types/catalog';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';

export function CategoryListPage(): JSX.Element {
  const queryClient = useQueryClient();
  const currentOrg = useAuthStore((state) => state.activeOrganization);
  const orgId = currentOrg?.id || '';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDocument | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Fetch Categories
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories', orgId],
    queryFn: () => fetchCategories(orgId),
    enabled: !!orgId,
  });

  // 2. React Hook Form Setup
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpsertCategoryInput>({
    resolver: zodResolver(UpsertCategoryInputSchema),
    defaultValues: {
      organizationId: orgId,
      name: '',
      code: '',
      parentId: null,
      description: '',
      displayOrder: 0,
      status: 'ACTIVE',
    },
  });

  // 3. Mutations
  const saveMutation = useMutation({
    mutationFn: saveCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', orgId] });
      setIsModalOpen(false);
      reset();
      setActionSuccess('Category saved successfully');
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to save category');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ catId }: { catId: string }) => archiveCategory(orgId, catId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', orgId] });
      setActionSuccess('Category archived successfully');
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to archive category');
    },
  });

  // Filter root categories for parent dropdown (Level 1 only)
  const rootCategories = categories.filter(
    (c) => c.parentId === null && c.status === 'ACTIVE' && (!editingCategory || c.id !== editingCategory.id)
  );

  const handleOpenAdd = () => {
    setEditingCategory(null);
    reset({
      organizationId: orgId,
      name: '',
      code: '',
      parentId: null,
      description: '',
      displayOrder: categories.length + 1,
      status: 'ACTIVE',
    });
    setActionError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (category: CategoryDocument) => {
    setEditingCategory(category);
    reset({
      organizationId: orgId,
      id: category.id,
      name: category.name,
      code: category.code,
      parentId: category.parentId,
      description: category.description || '',
      displayOrder: category.displayOrder,
      status: category.status,
      defaultTaxClassification: category.defaultTaxClassification,
    });
    setActionError(null);
    setIsModalOpen(true);
  };

  const onSubmit = (formData: UpsertCategoryInput) => {
    setActionError(null);
    saveMutation.mutate(formData);
  };

  // Group categories into hierarchy (Roots with their Subcategories)
  const filteredCategories = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const roots = filteredCategories.filter((c) => c.parentId === null);
  const getSubcategories = (parentId: string) => filteredCategories.filter((c) => c.parentId === parentId);

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-500">
        Please select an active organization to manage categories.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FolderTree className="h-6 w-6 text-brand-600" />
            Product Categories
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Organize catalog items into structured, 2-level hierarchical categories with tax defaults.
          </p>
        </div>
        <Button onClick={handleOpenAdd} className="flex items-center gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" />
          Add Category
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
          placeholder="Search categories by name or code..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Loading & Empty States */}
      {isLoading && (
        <div className="py-12 text-center text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto mb-3" />
          Loading organization categories...
        </div>
      )}

      {!isLoading && categories.length === 0 && (
        <Card className="p-12 text-center">
          <Layers className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No categories created yet</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            Get started by creating your first root category (e.g., Electronics, Menswear, Groceries).
          </p>
          <Button onClick={handleOpenAdd} className="mt-4">
            <Plus className="h-4 w-4 mr-1.5" />
            Create Root Category
          </Button>
        </Card>
      )}

      {/* Hierarchical Categories Display */}
      {!isLoading && categories.length > 0 && (
        <div className="space-y-4">
          {roots.map((root) => {
            const subcategories = getSubcategories(root.id);
            return (
              <Card key={root.id} className="overflow-hidden border border-slate-200 shadow-sm">
                {/* Root Category Row */}
                <div className="p-4 bg-slate-50/70 flex items-center justify-between border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs px-2 py-0.5 bg-slate-200 text-slate-700 rounded font-semibold">
                      {root.code}
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{root.name}</h3>
                      {root.description && <p className="text-xs text-slate-500">{root.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={root.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {root.status}
                    </Badge>
                    <button
                      onClick={() => handleOpenEdit(root)}
                      className="text-xs text-brand-600 hover:text-brand-800 font-medium px-2 py-1 rounded hover:bg-brand-50"
                    >
                      Edit
                    </button>
                    {root.status === 'ACTIVE' && (
                      <button
                        onClick={() => archiveMutation.mutate({ catId: root.id })}
                        disabled={archiveMutation.isPending}
                        className="text-xs text-slate-400 hover:text-rose-600 p-1 rounded"
                        title="Archive Category"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Subcategories List */}
                {subcategories.length > 0 && (
                  <div className="divide-y divide-slate-100 pl-6 bg-white">
                    {subcategories.map((sub) => (
                      <div key={sub.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/50">
                        <div className="flex items-center gap-2.5">
                          <ChevronRight className="h-4 w-4 text-slate-300" />
                          <span className="font-mono text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                            {sub.code}
                          </span>
                          <span className="text-sm font-medium text-slate-800">{sub.name}</span>
                          {sub.defaultTaxClassification && (
                            <span className="text-xs text-slate-400 ml-2">
                              HSN: {sub.defaultTaxClassification.code} ({sub.defaultTaxClassification.taxRatePercent}%)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={sub.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {sub.status}
                          </Badge>
                          <button
                            onClick={() => handleOpenEdit(sub)}
                            className="text-xs text-brand-600 hover:text-brand-800 font-medium px-2 py-1"
                          >
                            Edit
                          </button>
                          {sub.status === 'ACTIVE' && (
                            <button
                              onClick={() => archiveMutation.mutate({ catId: sub.id })}
                              disabled={archiveMutation.isPending}
                              className="text-xs text-slate-400 hover:text-rose-600 p-1"
                              title="Archive Subcategory"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Category Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCategory ? 'Edit Category' : 'Create Category'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Category Name"
            placeholder="e.g. Menswear or Casual Shirts"
            {...register('name')}
            error={errors.name?.message}
            required
          />

          <Input
            label="Category Code (Unique)"
            placeholder="e.g. MENS-WEAR"
            {...register('code')}
            error={errors.code?.message}
            helperText="Uppercase alphanumeric letters, dashes or underscores."
            required
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Parent Category (Hierarchy)
            </label>
            <select
              className="w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              {...register('parentId')}
            >
              <option value="">None (Top-Level Root Category)</option>
              {rootCategories.map((rc) => (
                <option key={rc.id} value={rc.id}>
                  {rc.name} ({rc.code})
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Select a root category to make this a Level 2 subcategory. Maximum 2 levels allowed.
            </p>
          </div>

          <Input
            label="Description (Optional)"
            placeholder="Brief description of products in this category"
            {...register('description')}
            error={errors.description?.message}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Default HSN/SAC Code"
              placeholder="e.g. 6205"
              {...register('defaultTaxClassification.code')}
              error={errors.defaultTaxClassification?.code?.message}
            />
            <Input
              label="Default GST Rate (%)"
              type="number"
              step="0.01"
              placeholder="e.g. 5 or 18"
              {...register('defaultTaxClassification.taxRatePercent', { valueAsNumber: true })}
            />
          </div>

          <Input
            label="Display Order"
            type="number"
            {...register('displayOrder', { valueAsNumber: true })}
            error={errors.displayOrder?.message}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save Category'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
