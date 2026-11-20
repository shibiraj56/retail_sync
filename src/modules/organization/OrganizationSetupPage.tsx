import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Card } from '../../components/common/Card';
import { organizationService } from '../../services/organizationService';
import { useAuthStore } from '../../stores/authStore';

const SetupOrgSchema = z.object({
  organizationName: z.string().min(2, 'Trading name must be at least 2 characters'),
  legalName: z.string().min(2, 'Legal entity name must be at least 2 characters'),
  businessType: z.enum([
    'GROCERY',
    'TEXTILE',
    'HARDWARE',
    'ELECTRICAL',
    'WHOLESALE',
    'GENERAL',
  ]),
  email: z.string().email('Please enter a valid business email'),
  phone: z.string().min(5, 'Phone must be at least 5 digits'),
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  country: z.string().default('India'),
  currency: z.string().default('INR'),
  timezone: z.string().default('Asia/Kolkata'),
  fiscalYearType: z.enum(['APRIL_TO_MARCH', 'JANUARY_TO_DECEMBER']),
  heldBillExpirationHours: z.coerce.number().min(1).max(72),
  primaryStoreName: z.string().min(2, 'Store name must be at least 2 characters'),
  primaryStoreCode: z
    .string()
    .min(2, 'Store code must be 2-10 alphanumeric characters')
    .max(10)
    .regex(/^[A-Z0-9_-]+$/, 'Store code must be uppercase alphanumeric (e.g. MAIN01)'),
});

type SetupOrgFormData = z.infer<typeof SetupOrgSchema>;

export const OrganizationSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, setActiveOrganization, setStores, setMemberships } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetupOrgFormData>({
    resolver: zodResolver(SetupOrgSchema),
    defaultValues: {
      country: 'India',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      fiscalYearType: 'APRIL_TO_MARCH',
      heldBillExpirationHours: 24,
      primaryStoreCode: 'MAIN01',
      primaryStoreName: 'Main Branch',
      email: user?.email || '',
    },
  });

  const onSubmit = async (data: SetupOrgFormData) => {
    setServerError(null);
    try {
      const result = await organizationService.provisionOrganization({
        organizationName: data.organizationName,
        legalName: data.legalName,
        businessType: data.businessType,
        email: data.email,
        phone: data.phone,
        address: {
          street: data.street,
          city: data.city,
          state: data.state,
          postalCode: data.postalCode,
          country: data.country,
        },
        currency: data.currency,
        timezone: data.timezone,
        fiscalYearType: data.fiscalYearType,
        heldBillExpirationHours: data.heldBillExpirationHours,
        primaryStoreName: data.primaryStoreName,
        primaryStoreCode: data.primaryStoreCode,
      });

      // Reload organization & stores context
      const org = await organizationService.getOrganization(result.organizationId);
      setActiveOrganization(org);

      if (user) {
        const memberships = await organizationService.getUserMemberships(user.uid);
        setMemberships(memberships);
      }

      if (org) {
        const stores = await organizationService.getStores(org.id);
        setStores(stores);
      }

      navigate('/');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to provision organization. Please try again.';
      setServerError(msg);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-600 text-white font-bold text-xl shadow-md mb-3">
            RS
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Provision Your Organization
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
            Configure your enterprise retail profile, fiscal calendar settings, and initial store branch.
          </p>
        </div>

        {serverError && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Provisioning Error</p>
              <p className="mt-0.5">{serverError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Section 1: Business Identity */}
          <Card
            title="1. Organization & Legal Identity"
            subtitle="Authoritative legal entity information for invoicing and tax filings"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Trade / Brand Name"
                placeholder="Apex Retail Supermarket"
                error={errors.organizationName?.message}
                {...register('organizationName')}
              />

              <Input
                label="Legal Registered Name"
                placeholder="Apex Supermarkets Private Limited"
                error={errors.legalName?.message}
                {...register('legalName')}
              />

              <Select
                label="Industry Vertical"
                options={[
                  { value: 'GROCERY', label: 'Grocery & Provision Store (Batch/Expiry)' },
                  { value: 'TEXTILE', label: 'Textile & Garment Shop (Matrix Variants)' },
                  { value: 'HARDWARE', label: 'Hardware Store (Dual Units / Cut lengths)' },
                  { value: 'ELECTRICAL', label: 'Electrical Shop (Serial / IMEI Tracking)' },
                  { value: 'WHOLESALE', label: 'Wholesale & Distribution (Slab Pricing)' },
                  { value: 'GENERAL', label: 'General Retail Store' },
                ]}
                error={errors.businessType?.message}
                {...register('businessType')}
              />

              <Input
                label="Official Email"
                type="email"
                placeholder="accounts@apexretail.com"
                error={errors.email?.message}
                {...register('email')}
              />

              <Input
                label="Official Contact Phone"
                placeholder="+91 98765 43210"
                error={errors.phone?.message}
                {...register('phone')}
              />

              <Input
                label="Country"
                disabled
                error={errors.country?.message}
                {...register('country')}
              />
            </div>
          </Card>

          {/* Section 2: Address */}
          <Card
            title="2. Registered Office Address"
            subtitle="Physical headquarters or primary operating address"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Input
                  label="Street Address"
                  placeholder="Plot 45, Commercial Avenue, Main Market"
                  error={errors.street?.message}
                  {...register('street')}
                />
              </div>

              <Input
                label="City"
                placeholder="Mumbai"
                error={errors.city?.message}
                {...register('city')}
              />

              <Input
                label="State / Province"
                placeholder="Maharashtra"
                error={errors.state?.message}
                {...register('state')}
              />

              <Input
                label="Postal / PIN Code"
                placeholder="400001"
                error={errors.postalCode?.message}
                {...register('postalCode')}
              />

              <Input
                label="Timezone"
                disabled
                error={errors.timezone?.message}
                {...register('timezone')}
              />
            </div>
          </Card>

          {/* Section 3: Fiscal Calendar & Policies */}
          <Card
            title="3. Fiscal Calendar & Held Bill Policy"
            subtitle="Configure fiscal boundaries and transaction lifetime policies"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Fiscal Year Accounting Cycle"
                options={[
                  {
                    value: 'APRIL_TO_MARCH',
                    label: 'April 1 to March 31 (Default - India FY)',
                  },
                  {
                    value: 'JANUARY_TO_DECEMBER',
                    label: 'January 1 to December 31 (Calendar Year)',
                  },
                ]}
                error={errors.fiscalYearType?.message}
                helperText="Locked automatically once the first invoice is issued"
                {...register('fiscalYearType')}
              />

              <Input
                label="Held Bill Expiration (Hours)"
                type="number"
                min={1}
                max={72}
                error={errors.heldBillExpirationHours?.message}
                helperText="System enforced between 1 and 72 hours (Default: 24)"
                {...register('heldBillExpirationHours')}
              />
            </div>
          </Card>

          {/* Section 4: Primary Store Branch */}
          <Card
            title="4. Primary Store Branch Provisioning"
            subtitle="Your first operational outlet and point of sale terminal"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Primary Store Name"
                placeholder="Main Flagship Store"
                error={errors.primaryStoreName?.message}
                {...register('primaryStoreName')}
              />

              <Input
                label="Store Identifier Code"
                placeholder="MAIN01"
                error={errors.primaryStoreCode?.message}
                helperText="Alphanumeric prefix for sequential invoices (e.g. RS/MAIN01/2026-27/)"
                {...register('primaryStoreCode')}
              />
            </div>
          </Card>

          <div className="flex items-center justify-end gap-3 pt-4">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              rightIcon={<ArrowRight className="w-5 h-5" />}
            >
              Complete Provisioning & Enter Console
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
