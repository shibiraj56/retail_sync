import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Scale, Plus, Archive, AlertCircle, CheckCircle2, Sparkles, Hash } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchUnitsOfMeasure,
  saveUnitOfMeasure,
  seedDefaultUnits,
  archiveUnitOfMeasure,
} from '../../services/catalogService';
import {
  UpsertUomInputSchema,
  type UpsertUomInput,
} from '../../types/catalog';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';

export function UomListPage(): JSX.Element {
  const queryClient = useQueryClient();
  const currentOrg = useAuthStore((state) => state.activeOrganization);
  const orgId = currentOrg?.id || '';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // 1. Fetch UoMs
  const { data: uoms = [], isLoading } = useQuery({
    queryKey: ['unitsOfMeasure', orgId],
    queryFn: () => fetchUnitsOfMeasure(orgId),
    enabled: !!orgId,
  });

  // 2. React Hook Form Setup
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<UpsertUomInput>({
    resolver: zodResolver(UpsertUomInputSchema),
    defaultValues: {
      organizationId: orgId,
      name: '',
      symbol: '',
      type: 'COUNT',
      allowDecimals: false,
      decimalPrecision: 0,
      status: 'ACTIVE',
    },
  });

  const allowDecimals = watch('allowDecimals');

  // 3. Mutations
  const saveMutation = useMutation({
    mutationFn: saveUnitOfMeasure,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unitsOfMeasure', orgId] });
      setIsModalOpen(false);
      reset();
      setActionSuccess('Unit of Measure saved successfully');
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to save Unit of Measure');
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => seedDefaultUnits(orgId),
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['unitsOfMeasure', orgId] });
      setActionSuccess(`Successfully seeded ${count} standard units of measure (PCS, KG, GM, MTR, LTR, BOX, SET)`);
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to seed default units');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ uomId }: { uomId: string }) => archiveUnitOfMeasure(orgId, uomId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unitsOfMeasure', orgId] });
      setActionSuccess('Unit of Measure archived successfully');
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to archive Unit of Measure');
    },
  });

  const handleOpenAdd = () => {
    reset({
      organizationId: orgId,
      name: '',
      symbol: '',
      type: 'COUNT',
      allowDecimals: false,
      decimalPrecision: 0,
      status: 'ACTIVE',
    });
    setActionError(null);
    setIsModalOpen(true);
  };

  const onSubmit = (formData: UpsertUomInput) => {
    setActionError(null);
    saveMutation.mutate(formData);
  };

  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-500">
        Please select an active organization to manage units of measure.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Scale className="h-6 w-6 text-brand-600" />
            Units of Measure (UoM)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Define measurement standards, decimal precision limits, and packaging unit definitions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {uoms.length === 0 && (
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="flex items-center gap-1.5"
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              {seedMutation.isPending ? 'Seeding...' : 'Seed Standard Units'}
            </Button>
          )}
          <Button onClick={handleOpenAdd} className="flex items-center gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" />
            Add Custom Unit
          </Button>
        </div>
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

      {/* Loading State */}
      {isLoading && (
        <div className="py-12 text-center text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto mb-3" />
          Loading units of measure...
        </div>
      )}

      {/* Empty State */}
      {!isLoading && uoms.length === 0 && (
        <Card className="p-12 text-center">
          <Scale className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No units of measure configured</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            Quickly initialize your catalog with the 7 standard retail units (PCS, KG, GM, MTR, LTR, BOX, SET).
          </p>
          <Button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="mt-4"
          >
            <Sparkles className="h-4 w-4 mr-1.5" />
            Seed Standard Units
          </Button>
        </Card>
      )}

      {/* UoM Data Table */}
      {!isLoading && uoms.length > 0 && (
        <Card className="overflow-hidden border border-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Symbol</th>
                  <th className="py-3 px-4">Unit Name</th>
                  <th className="py-3 px-4">Dimension Type</th>
                  <th className="py-3 px-4">Decimal Precision</th>
                  <th className="py-3 px-4">System Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {uoms.map((uom) => (
                  <tr key={uom.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {uom.symbol}
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-medium">
                      {uom.name}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                        {uom.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {uom.allowDecimals ? (
                        <span className="flex items-center gap-1 text-emerald-700 font-medium text-xs">
                          <Hash className="h-3.5 w-3.5" />
                          Fractional ({uom.decimalPrecision} decimals)
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">Integer Only (0 decimals)</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {uom.isSystemDefault ? (
                        <Badge variant="brand">System Default</Badge>
                      ) : (
                        <Badge variant="neutral">Custom</Badge>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={uom.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {uom.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {!uom.isSystemDefault && uom.status === 'ACTIVE' && (
                        <button
                          onClick={() => archiveMutation.mutate({ uomId: uom.id })}
                          disabled={archiveMutation.isPending}
                          className="text-xs text-slate-400 hover:text-rose-600 inline-flex items-center gap-1"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Archive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add Custom UoM Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Custom Unit of Measure"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Unit Name"
            placeholder="e.g. Dozen, Pack, or Bundle"
            {...register('name')}
            error={errors.name?.message}
            required
          />

          <Input
            label="Symbol (Unique Code)"
            placeholder="e.g. DZN, PCK, or BDL"
            {...register('symbol')}
            error={errors.symbol?.message}
            helperText="Uppercase alphanumeric letters used on receipts and labels."
            required
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Dimension Type
            </label>
            <select
              className="w-full rounded-md border border-slate-300 bg-white py-2 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              {...register('type')}
            >
              <option value="COUNT">COUNT (Pieces, Packs, Sets)</option>
              <option value="WEIGHT">WEIGHT (Kilograms, Grams, Tons)</option>
              <option value="VOLUME">VOLUME (Liters, Milliliters)</option>
              <option value="LENGTH">LENGTH (Meters, Centimeters)</option>
              <option value="AREA">AREA (Square Meters, Sq Ft)</option>
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="allowDecimals"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              {...register('allowDecimals')}
            />
            <label htmlFor="allowDecimals" className="text-sm font-medium text-slate-800">
              Allow fractional quantities (e.g. 1.25 kg)
            </label>
          </div>

          {allowDecimals && (
            <Input
              label="Decimal Precision"
              type="number"
              min={1}
              max={4}
              placeholder="e.g. 2 or 3"
              {...register('decimalPrecision', { valueAsNumber: true })}
              error={errors.decimalPrecision?.message}
              helperText="Number of decimal digits allowed (typically 2 for length/currency, 3 for weight/volume)."
            />
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save Unit'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
