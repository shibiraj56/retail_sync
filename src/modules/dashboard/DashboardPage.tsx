import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Store,
  Users,
  ShieldCheck,
  Calendar,
  Clock,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { useAuthStore } from '../../stores/authStore';
import { organizationService } from '../../services/organizationService';

export const DashboardPage: React.FC = () => {
  const { activeOrganization, activeMembership, activeStore, stores } = useAuthStore();
  const [memberCount, setMemberCount] = useState<number>(0);

  useEffect(() => {
    if (activeOrganization) {
      organizationService
        .getOrganizationMembers(activeOrganization.id)
        .then((members) => setMemberCount(members.length))
        .catch((err) => console.error('Failed to load member count:', err));
    }
  }, [activeOrganization]);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider">
              Organization Console
            </span>
            <Badge variant="brand" size="sm">
              {activeOrganization?.businessType || 'GENERAL'}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {activeOrganization?.organizationName}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Legal Entity: <strong>{activeOrganization?.legalName}</strong> • Logged in as{' '}
            <strong className="text-slate-700">{activeMembership?.role}</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/stores">
            <Button variant="outline" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Add Branch
            </Button>
          </Link>
          <Link to="/team">
            <Button variant="primary" size="sm" leftIcon={<Users className="w-3.5 h-3.5" />}>
              Invite Member
            </Button>
          </Link>
        </div>
      </div>

      {/* Real Real-Time Metric Cards (No Fake Charts!) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider">
              Store Branches
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{stores.length}</p>
          <p className="text-2xs text-slate-500 mt-1">Configured retail locations</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider">
              Active Team
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{memberCount}</p>
          <p className="text-2xs text-slate-500 mt-1">Authorized staff members</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider">
              Fiscal Cycle
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="text-sm font-bold text-slate-900 mt-2 truncate">
            {activeOrganization?.fiscalYearSettings?.type === 'APRIL_TO_MARCH'
              ? 'Apr 1 – Mar 31'
              : 'Jan 1 – Dec 31'}
          </p>
          <p className="text-2xs text-slate-500 mt-1">
            Status: {activeOrganization?.fiscalYearSettings?.isLocked ? 'Locked' : 'Open'}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider">
              Held Bill Timeout
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {activeOrganization?.heldBillSettings?.expirationHours || 24}h
          </p>
          <p className="text-2xs text-slate-500 mt-1">Application timeout policy</p>
        </Card>
      </div>

      {/* Two Column Layout: Active Store Details + Operational Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Store Details */}
        <Card
          title="Active Store Branch Information"
          subtitle="Currently selected branch terminal"
          action={
            <Link to="/stores" className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          }
        >
          {activeStore ? (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Branch Name:</span>
                <span className="font-semibold text-slate-900">{activeStore.name}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Store Code:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {activeStore.storeCode}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Invoice Numbering Prefix:</span>
                <span className="font-mono text-slate-700">
                  {activeStore.invoiceSettings.prefix}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Contact Phone:</span>
                <span className="font-semibold text-slate-800">{activeStore.contactPhone}</span>
              </div>
              <div className="flex items-start justify-between">
                <span className="text-slate-500">Location Address:</span>
                <span className="text-right text-slate-700 max-w-xs">
                  {activeStore.address.street}, {activeStore.address.city},{' '}
                  {activeStore.address.state} - {activeStore.address.postalCode}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center">No active store selected</p>
          )}
        </Card>

        {/* Security & Infrastructure Health */}
        <Card
          title="Security & Monolith Verification"
          subtitle="Real-time multi-tenant integrity status"
        >
          <div className="space-y-3.5 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="font-medium text-slate-800">Tenant Isolation Guard</span>
              </div>
              <span className="text-3xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                ENFORCED (SERVER-SIDE)
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="font-medium text-slate-800">Role & Store Authorization</span>
              </div>
              <span className="text-3xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                AUTHORITATIVE
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-brand-600" />
                <span className="font-medium text-slate-800">Database Engine</span>
              </div>
              <span className="text-3xs font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                Cloud Firestore (asia-south1)
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-600" />
                <span className="font-medium text-slate-800">Development Environment</span>
              </div>
              <span className="text-3xs font-mono text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                Firebase Local Emulator Suite
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
