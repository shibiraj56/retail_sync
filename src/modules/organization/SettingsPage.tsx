import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { httpsCallable } from 'firebase/functions';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { useAuthStore } from '../../stores/authStore';
import { functions } from '../../config/firebase';
import { organizationService } from '../../services/organizationService';

const HeldBillSettingsSchema = z.object({
  expirationHours: z.coerce.number().min(1).max(72),
});

type HeldBillFormData = z.infer<typeof HeldBillSettingsSchema>;

export const SettingsPage: React.FC = () => {
  const { activeOrganization, activeMembership, setActiveOrganization } = useAuthStore();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isOwner = activeMembership?.role === 'OWNER';
  const isFiscalYearLocked = activeOrganization?.fiscalYearSettings?.isLocked;

  const {
    register: registerHeldBill,
    handleSubmit: handleHeldBillSubmit,
    formState: { isSubmitting: isSubmittingHeldBill },
  } = useForm<HeldBillFormData>({
    resolver: zodResolver(HeldBillSettingsSchema),
    defaultValues: {
      expirationHours: activeOrganization?.heldBillSettings?.expirationHours || 24,
    },
  });

  const onUpdateHeldBill = async (data: HeldBillFormData) => {
    if (!activeOrganization) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const callable = httpsCallable(functions, 'updateHeldBillSettings');
      await callable({
        organizationId: activeOrganization.id,
        expirationHours: data.expirationHours,
      });

      const updated = await organizationService.getOrganization(activeOrganization.id);
      setActiveOrganization(updated);
      setSuccessMsg('Held bill policy updated successfully.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  const handleFiscalYearSwitch = async (type: 'APRIL_TO_MARCH' | 'JANUARY_TO_DECEMBER') => {
    if (!activeOrganization) return;
    if (isFiscalYearLocked) {
      alert('Fiscal year is locked after invoices exist and cannot be modified.');
      return;
    }

    try {
      const callable = httpsCallable(functions, 'updateFiscalYear');
      await callable({
        organizationId: activeOrganization.id,
        fiscalYearType: type,
      });

      const updated = await organizationService.getOrganization(activeOrganization.id);
      setActiveOrganization(updated);
      setSuccessMsg('Fiscal year calendar cycle updated.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update fiscal year');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Organization Settings & Policies
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Tenant identity, accounting calendar cycles, and operational timeout parameters
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Organization Overview */}
      <Card title="Legal & Brand Profile" subtitle="Configured during organization provisioning">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-3xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Trading Name
            </label>
            <p className="font-semibold text-slate-900">{activeOrganization?.organizationName}</p>
          </div>

          <div>
            <label className="text-3xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Legal Registered Name
            </label>
            <p className="font-semibold text-slate-900">{activeOrganization?.legalName}</p>
          </div>

          <div>
            <label className="text-3xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Industry Vertical Mode
            </label>
            <Badge variant="brand" size="sm">
              {activeOrganization?.businessType}
            </Badge>
          </div>

          <div>
            <label className="text-3xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Base Operating Currency & Timezone
            </label>
            <p className="font-mono text-slate-700">
              {activeOrganization?.currency} • {activeOrganization?.timezone}
            </p>
          </div>
        </div>
      </Card>

      {/* Fiscal Year Configuration */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>Fiscal Year Accounting Cycle</span>
          </div>
        }
        subtitle="Governs sequential invoice numbering partitions (/counters/invoices_{FY})"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div>
              <p className="font-semibold text-slate-900">
                Current Cycle:{' '}
                {activeOrganization?.fiscalYearSettings?.type === 'APRIL_TO_MARCH'
                  ? 'April 1 to March 31 (Indian Financial Year)'
                  : 'January 1 to December 31 (Calendar Year)'}
              </p>
              <p className="text-3xs text-slate-500 mt-0.5">
                Counter documents are scoped per store and annual cycle.
              </p>
            </div>

            {isFiscalYearLocked ? (
              <Badge variant="amber" size="sm" className="flex items-center gap-1">
                <Lock className="w-3 h-3" />
                PERMANENTLY LOCKED
              </Badge>
            ) : (
              <Badge variant="success" size="sm">
                CONFIGURABLE
              </Badge>
            )}
          </div>

          {isFiscalYearLocked ? (
            <p className="text-2xs text-slate-500 italic">
              Note: This setting is locked because invoices have been issued. Changing fiscal
              boundaries post-sale requires authorized administrative reconciliation to prevent
              numbering collisions.
            </p>
          ) : isOwner ? (
            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Switch Accounting Cycle
              </label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant={
                    activeOrganization?.fiscalYearSettings?.type === 'APRIL_TO_MARCH'
                      ? 'primary'
                      : 'outline'
                  }
                  size="sm"
                  onClick={() => handleFiscalYearSwitch('APRIL_TO_MARCH')}
                >
                  April 1 to March 31
                </Button>

                <Button
                  type="button"
                  variant={
                    activeOrganization?.fiscalYearSettings?.type === 'JANUARY_TO_DECEMBER'
                      ? 'primary'
                      : 'outline'
                  }
                  size="sm"
                  onClick={() => handleFiscalYearSwitch('JANUARY_TO_DECEMBER')}
                >
                  January 1 to December 31
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Held Bill Expiration Policy */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <span>Held Bill Lifetime & Expiration Policy</span>
          </div>
        }
        subtitle="Governs how long parked carts remain valid before rejection at checkout"
      >
        <form onSubmit={handleHeldBillSubmit(onUpdateHeldBill)} className="space-y-4">
          <div className="max-w-xs">
            <Input
              label="Expiration Window (Hours)"
              type="number"
              min={1}
              max={72}
              helperText="System enforced range: 1 to 72 hours (Default: 24)"
              disabled={!isOwner}
              {...registerHeldBill('expirationHours')}
            />
          </div>

          <p className="text-2xs text-slate-500">
            * Authoritative application check rejects expired held bills upon retrieval. Firestore
            TTL is used purely for eventual background cleanup.
          </p>

          {isOwner && (
            <Button
              type="submit"
              variant="outline"
              size="sm"
              isLoading={isSubmittingHeldBill}
            >
              Update Policy
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
};
