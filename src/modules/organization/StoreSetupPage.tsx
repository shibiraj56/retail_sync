import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Store as StoreIcon, Plus, CheckCircle2, AlertCircle, MapPin, Phone } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { useAuthStore } from '../../stores/authStore';
import { organizationService } from '../../services/organizationService';

const NewStoreSchema = z.object({
  name: z.string().min(2, 'Store name must be at least 2 characters'),
  storeCode: z
    .string()
    .min(2, 'Store code must be 2-10 alphanumeric characters')
    .max(10)
    .regex(/^[A-Z0-9_-]+$/, 'Must be uppercase alphanumeric (e.g. BLR02)'),
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  country: z.string().default('India'),
  contactPhone: z.string().min(5, 'Phone must be at least 5 digits'),
  contactEmail: z.string().email().optional().or(z.literal('')),
  invoicePrefix: z.string().optional(),
});

type NewStoreFormData = z.infer<typeof NewStoreSchema>;

export const StoreSetupPage: React.FC = () => {
  const { activeOrganization, stores, setStores, activeMembership } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const canManageStores =
    activeMembership?.role === 'OWNER' || activeMembership?.permissions.includes('stores:manage');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewStoreFormData>({
    resolver: zodResolver(NewStoreSchema),
    defaultValues: {
      country: 'India',
      state: activeOrganization?.address.state || '',
      city: activeOrganization?.address.city || '',
    },
  });

  const onSubmit = async (data: NewStoreFormData) => {
    if (!activeOrganization) return;
    setServerError(null);

    try {
      await organizationService.createStore({
        organizationId: activeOrganization.id,
        storeCode: data.storeCode,
        name: data.name,
        address: {
          street: data.street,
          city: data.city,
          state: data.state,
          postalCode: data.postalCode,
          country: data.country,
        },
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail || undefined,
        invoicePrefix: data.invoicePrefix || `RS/${data.storeCode}/2026-27/`,
      });

      // Reload stores
      const updatedStores = await organizationService.getStores(activeOrganization.id);
      setStores(updatedStores);
      setIsModalOpen(false);
      reset();
    } catch (err: unknown) {
      setServerError(
        err instanceof Error ? err.message : 'Failed to create store. Please try again.'
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Store Branches</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage physical retail outlets, warehouses, and terminal invoice configurations
          </p>
        </div>

        {canManageStores && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsModalOpen(true)}
          >
            Add Branch Outlet
          </Button>
        )}
      </div>

      {/* Stores List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {stores.map((store) => (
          <Card key={store.id} className="relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 border border-brand-100">
                    <StoreIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{store.name}</h3>
                    <p className="text-xs font-mono text-slate-500 uppercase">
                      CODE: {store.storeCode}
                    </p>
                  </div>
                </div>
                {store.isPrimary && (
                  <Badge variant="brand" size="sm">
                    PRIMARY
                  </Badge>
                )}
              </div>

              <div className="space-y-2 text-xs text-slate-600 my-4 pt-3 border-t border-slate-100">
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    {store.address.street}, {store.address.city}, {store.address.state} -{' '}
                    {store.address.postalCode}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{store.contactPhone}</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-2xs text-slate-400 font-mono">
              <span>PREFIX: {store.invoiceSettings.prefix}</span>
              <span className="flex items-center gap-1 text-emerald-600 font-sans font-semibold">
                <CheckCircle2 className="w-3 h-3" />
                ACTIVE
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Modal for adding a new store */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Provision New Store Branch"
        description="Add a new physical location to your organization"
        maxWidth="lg"
      >
        {serverError && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Branch Name"
              placeholder="e.g. Andheri West Outlet"
              error={errors.name?.message}
              {...register('name')}
            />

            <Input
              label="Store Code (Alphanumeric)"
              placeholder="e.g. BOM02"
              error={errors.storeCode?.message}
              {...register('storeCode')}
            />
          </div>

          <Input
            label="Street Address"
            placeholder="Shop 12, Phoenix Market City"
            error={errors.street?.message}
            {...register('street')}
          />

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="City"
              placeholder="Mumbai"
              error={errors.city?.message}
              {...register('city')}
            />
            <Input
              label="State"
              placeholder="Maharashtra"
              error={errors.state?.message}
              {...register('state')}
            />
            <Input
              label="Postal Code"
              placeholder="400070"
              error={errors.postalCode?.message}
              {...register('postalCode')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Contact Phone"
              placeholder="+91 98765 00000"
              error={errors.contactPhone?.message}
              {...register('contactPhone')}
            />
            <Input
              label="Contact Email (Optional)"
              type="email"
              placeholder="branch@retail.com"
              error={errors.contactEmail?.message}
              {...register('contactEmail')}
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              Create Store Branch
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
