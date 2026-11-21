import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Receipt,
  Percent,
  Sliders,
  Calculator,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Store,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchTaxConfigurations,
  saveTaxConfiguration,
  seedDefaultTaxConfigurations,
  archiveTaxConfiguration,
  fetchPricingRules,
  savePricingRule,
  archivePricingRule,
} from '../../services/pricingService';
import { fetchProducts } from '../../services/catalogService';
import { fetchVariants } from '../../services/variantService';
import { bulkUpdateVariantPricing } from '../../services/pricingService';
import { calculateTax } from '../../lib/tax';
import { formatMoney } from '../../lib/money';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';

export function PricingManagementPage(): JSX.Element {
  const queryClient = useQueryClient();
  const currentOrg = useAuthStore((state) => state.activeOrganization);
  const orgId = currentOrg?.id || '';

  const [activeTab, setActiveTab] = useState<'tax' | 'rules' | 'bulk' | 'calculator' | 'history'>('tax');

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ==========================================================================
  // TAB 1: TAX CONFIGURATIONS
  // ==========================================================================
  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
  const [taxFormName, setTaxFormName] = useState('');
  const [taxFormCode, setTaxFormCode] = useState('');
  const [taxFormRate, setTaxFormRate] = useState<number>(18);
  const [taxFormJurisdiction, setTaxFormJurisdiction] = useState<'INDIA_GST' | 'GENERIC_VAT' | 'CUSTOM'>('INDIA_GST');

  const { data: taxConfigs = [], isLoading: isLoadingTaxes } = useQuery({
    queryKey: ['taxConfigurations', orgId],
    queryFn: () => fetchTaxConfigurations(orgId),
    enabled: !!orgId,
  });

  const saveTaxMutation = useMutation({
    mutationFn: () =>
      saveTaxConfiguration({
        organizationId: orgId,
        name: taxFormName,
        code: taxFormCode.toUpperCase(),
        ratePercent: taxFormRate,
        jurisdiction: taxFormJurisdiction,
        effectiveStartDate: new Date().toISOString(),
        components: [
          { name: `CGST (${taxFormRate / 2}%)`, ratePercent: taxFormRate / 2, type: 'CGST' },
          { name: `SGST (${taxFormRate / 2}%)`, ratePercent: taxFormRate / 2, type: 'SGST' },
        ],
        status: 'ACTIVE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxConfigurations', orgId] });
      setIsTaxModalOpen(false);
      setTaxFormName('');
      setTaxFormCode('');
      setActionSuccess('Tax configuration saved successfully');
      setTimeout(() => setActionSuccess(null), 3500);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to save tax configuration');
    },
  });

  const seedTaxesMutation = useMutation({
    mutationFn: () => seedDefaultTaxConfigurations(orgId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['taxConfigurations', orgId] });
      setActionSuccess(`Successfully seeded ${data.seededCount} standard GST slabs`);
      setTimeout(() => setActionSuccess(null), 3500);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to seed GST slabs');
    },
  });

  const archiveTaxMutation = useMutation({
    mutationFn: (id: string) => archiveTaxConfiguration(orgId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxConfigurations', orgId] });
      setActionSuccess('Tax slab archived');
      setTimeout(() => setActionSuccess(null), 3500);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to archive tax slab');
    },
  });

  // ==========================================================================
  // TAB 2: PRICING RULES
  // ==========================================================================
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleLevel, setRuleLevel] = useState<'STORE' | 'CUSTOMER_GROUP' | 'CUSTOMER'>('STORE');
  const [ruleTargetId, setRuleTargetId] = useState('');
  const [ruleProductId, setRuleProductId] = useState('');
  const [ruleVariantId, setRuleVariantId] = useState('');
  const [rulePriceRupees, setRulePriceRupees] = useState<number>(0);
  const [ruleReason, setRuleReason] = useState('');

  const { data: pricingRules = [], isLoading: isLoadingRules } = useQuery({
    queryKey: ['pricingRules', orgId],
    queryFn: () => fetchPricingRules(orgId),
    enabled: !!orgId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products', orgId],
    queryFn: () => fetchProducts(orgId),
    enabled: !!orgId,
  });

  const { data: selectedProductVariants = [] } = useQuery({
    queryKey: ['productVariants', orgId, ruleProductId],
    queryFn: () => (ruleProductId ? fetchVariants(orgId, ruleProductId) : []),
    enabled: !!orgId && !!ruleProductId,
  });

  const saveRuleMutation = useMutation({
    mutationFn: () =>
      savePricingRule({
        organizationId: orgId,
        level: ruleLevel,
        targetEntityId: ruleTargetId.trim(),
        productId: ruleProductId,
        variantId: ruleVariantId || null,
        priceMinor: Math.round(rulePriceRupees * 100),
        currency: 'INR',
        effectiveStartDate: new Date().toISOString(),
        effectiveEndDate: null,
        status: 'ACTIVE',
        reason: ruleReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricingRules', orgId] });
      setIsRuleModalOpen(false);
      setRuleTargetId('');
      setRulePriceRupees(0);
      setRuleReason('');
      setActionSuccess('Pricing rule saved successfully');
      setTimeout(() => setActionSuccess(null), 3500);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to save pricing rule');
    },
  });

  const archiveRuleMutation = useMutation({
    mutationFn: (id: string) => archivePricingRule(orgId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricingRules', orgId] });
      setActionSuccess('Pricing rule archived');
      setTimeout(() => setActionSuccess(null), 3500);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to archive pricing rule');
    },
  });

  // ==========================================================================
  // TAB 3: BULK PRICING UPDATES
  // ==========================================================================
  const [bulkProductId, setBulkProductId] = useState('');
  const [bulkAdjustmentType, setBulkAdjustmentType] = useState<'PERCENT_MARKUP' | 'FIXED_PRICE'>('PERCENT_MARKUP');
  const [bulkAdjustmentValue, setBulkAdjustmentValue] = useState<number>(10);
  const [bulkReason, setBulkReason] = useState('Quarterly Price Revision');

  const { data: bulkVariants = [], isLoading: isLoadingBulkVariants } = useQuery({
    queryKey: ['productVariants', orgId, bulkProductId],
    queryFn: () => (bulkProductId ? fetchVariants(orgId, bulkProductId, true) : []),
    enabled: !!orgId && !!bulkProductId,
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: () => {
      const updates = bulkVariants.map((v) => {
        let newSelling = v.pricing?.sellingPrice || 0;
        if (bulkAdjustmentType === 'PERCENT_MARKUP') {
          newSelling = Math.round(newSelling * (1 + bulkAdjustmentValue / 100));
        } else {
          newSelling = Math.round(bulkAdjustmentValue * 100);
        }

        const mrp = Math.max(v.pricing?.mrp || 0, newSelling);

        return {
          variantId: v.id,
          pricing: {
            mrp,
            sellingPrice: newSelling,
            costPrice: v.pricing?.costPrice || 0,
            wholesalePrice: v.pricing?.wholesalePrice,
            minimumSellingPrice: v.pricing?.minimumSellingPrice,
          },
        };
      });

      return bulkUpdateVariantPricing({
        organizationId: orgId,
        productId: bulkProductId,
        updates,
        reason: bulkReason,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['productVariants', orgId, bulkProductId] });
      setActionSuccess(`Successfully updated pricing for ${data.updatedCount} variants!`);
      setTimeout(() => setActionSuccess(null), 3500);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to apply bulk pricing updates');
    },
  });

  // ==========================================================================
  // TAB 4: PRICING & GST CALCULATOR
  // ==========================================================================
  const [calcBaseAmountRupees, setCalcBaseAmountRupees] = useState<number>(1000);
  const [calcPricingType, setCalcPricingType] = useState<'TAX_INCLUSIVE' | 'TAX_EXCLUSIVE'>('TAX_EXCLUSIVE');
  const [calcRatePercent, setCalcRatePercent] = useState<number>(18);
  const [calcOriginState, setCalcOriginState] = useState('27'); // Maharashtra
  const [calcDestState, setCalcDestState] = useState('27'); // Maharashtra (Intra)
  const [calcDiscountRupees, setCalcDiscountRupees] = useState<number>(0);

  const calcResult = calculateTax({
    baseAmountMinor: Math.round(calcBaseAmountRupees * 100),
    pricingType: calcPricingType,
    taxRatePercent: calcRatePercent,
    originStateCode: calcOriginState,
    destinationStateCode: calcDestState,
    discountAmountMinor: Math.round(calcDiscountRupees * 100),
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-5 h-5 text-brand-600" />
            Pricing Hierarchy & Tax Configuration
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise pricing precedence, multi-store overrides, and India GST compliance engine.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'tax' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => seedTaxesMutation.mutate()}
                disabled={seedTaxesMutation.isPending}
                className="flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Seed Standard GST Slabs
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsTaxModalOpen(true)}
                className="flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Tax Slab
              </Button>
            </>
          )}

          {activeTab === 'rules' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsRuleModalOpen(true)}
              className="flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New Pricing Rule
            </Button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('tax')}
          className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'tax'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Percent className="w-4 h-4" />
          GST Tax Slabs ({taxConfigs.filter((t) => t.status === 'ACTIVE').length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'rules'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Store className="w-4 h-4" />
          Store & Tier Pricing Rules ({pricingRules.filter((r) => r.status === 'ACTIVE').length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bulk')}
          className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'bulk'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Bulk Price Updates
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('calculator')}
          className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'calculator'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calculator className="w-4 h-4" />
          Pricing & GST Simulator
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: TAX CONFIGURATIONS (GST SLABS)                                */}
      {/* ==================================================================== */}
      {activeTab === 'tax' && (
        <div className="space-y-4">
          {isLoadingTaxes ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading tax configurations...</div>
          ) : taxConfigs.length === 0 ? (
            <Card className="p-8 text-center space-y-3">
              <Percent className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">No Tax Slabs Configured</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Seed the standard India GST slabs (0%, 0.25%, 3%, 5%, 12%, 18%, 28%) or add a custom tax configuration.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => seedTaxesMutation.mutate()}
                disabled={seedTaxesMutation.isPending}
              >
                Seed Standard India GST Slabs
              </Button>
            </Card>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-3xs font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Slab Name & Code</th>
                    <th className="py-2.5 px-3">Jurisdiction</th>
                    <th className="py-2.5 px-3 text-right">Total Rate</th>
                    <th className="py-2.5 px-3">Intra-State Components</th>
                    <th className="py-2.5 px-3">Effective Date</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {taxConfigs.map((tax) => (
                    <tr key={tax.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{tax.name}</div>
                        <div className="font-mono text-3xs text-slate-400">{tax.code}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-3xs">
                        <Badge variant="neutral">{tax.jurisdiction}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 text-sm">
                        {tax.ratePercent}%
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {tax.components?.map((c, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-mono bg-slate-100 text-slate-700"
                            >
                              {c.type}: {c.ratePercent}%
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-3xs text-slate-500 font-mono">
                        {new Date(tax.effectiveStartDate).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant={tax.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {tax.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {tax.status === 'ACTIVE' && !tax.isSystemDefault && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-rose-600 hover:text-rose-700 text-3xs py-1 px-2"
                            onClick={() => archiveTaxMutation.mutate(tax.id)}
                            disabled={archiveTaxMutation.isPending}
                          >
                            Archive
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: STORE & TIER PRICING RULES                                    */}
      {/* ==================================================================== */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          {isLoadingRules ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading pricing rules...</div>
          ) : pricingRules.length === 0 ? (
            <Card className="p-8 text-center space-y-3">
              <Store className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">No Store Overrides or Customer Tiers</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Create branch-level price overrides or customer-group wholesale tiers without modifying master catalog prices.
              </p>
              <Button variant="primary" size="sm" onClick={() => setIsRuleModalOpen(true)}>
                Create Pricing Rule
              </Button>
            </Card>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-3xs font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Level & Target</th>
                    <th className="py-2.5 px-3">Product ID</th>
                    <th className="py-2.5 px-3">Variant</th>
                    <th className="py-2.5 px-3 text-right">Override Price</th>
                    <th className="py-2.5 px-3">Effective Period</th>
                    <th className="py-2.5 px-3">Reason / Note</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pricingRules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="brand">{r.level}</Badge>
                          <span className="font-mono font-bold text-slate-800">{r.targetEntityId}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-3xs text-slate-600 truncate max-w-[120px]">
                        {r.productId}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-3xs text-slate-600">
                        {r.variantId || 'All Variants'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono text-sm">
                        {formatMoney(r.priceMinor, r.currency)}
                      </td>
                      <td className="py-2.5 px-3 text-3xs text-slate-500 font-mono">
                        {new Date(r.effectiveStartDate).toLocaleDateString()} &rarr;{' '}
                        {r.effectiveEndDate ? new Date(r.effectiveEndDate).toLocaleDateString() : 'Indefinite'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 italic max-w-xs truncate">
                        {r.reason || 'None'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant={r.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {r.status === 'ACTIVE' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-rose-600 hover:text-rose-700 text-3xs py-1 px-2"
                            onClick={() => archiveRuleMutation.mutate(r.id)}
                            disabled={archiveRuleMutation.isPending}
                          >
                            Archive
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: BULK PRICING UPDATES                                          */}
      {/* ==================================================================== */}
      {activeTab === 'bulk' && (
        <Card className="p-6 space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-brand-600" />
              Batch Variant Price Adjuster
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Apply bulk percentage markups or fixed price overrides across all variants of a product.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Select Product</label>
              <select
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                value={bulkProductId}
                onChange={(e) => setBulkProductId(e.target.value)}
              >
                <option value="">-- Choose Product --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Adjustment Type</label>
              <select
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                value={bulkAdjustmentType}
                onChange={(e) => setBulkAdjustmentType(e.target.value as any)}
              >
                <option value="PERCENT_MARKUP">Percentage Markup (%)</option>
                <option value="FIXED_PRICE">Fixed Selling Price (₹)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">
                {bulkAdjustmentType === 'PERCENT_MARKUP' ? 'Markup Percentage (%)' : 'New Price (₹)'}
              </label>
              <Input
                type="number"
                step="0.01"
                value={bulkAdjustmentValue}
                onChange={(e) => setBulkAdjustmentValue(parseFloat(e.target.value) || 0)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Audit Reason</label>
              <Input
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                placeholder="e.g. Festival Season Revision"
                className="text-xs"
              />
            </div>
          </div>

          {bulkProductId && (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Preview Adjustments ({bulkVariants.length} Variants)
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => bulkUpdateMutation.mutate()}
                  disabled={bulkUpdateMutation.isPending || bulkVariants.length === 0}
                >
                  {bulkUpdateMutation.isPending ? 'Committing Batch...' : `Apply to ${bulkVariants.length} Variants`}
                </Button>
              </div>

              {isLoadingBulkVariants ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading variants...</div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-3xs font-semibold">
                      <tr>
                        <th className="py-2 px-3">Variant / SKU</th>
                        <th className="py-2 px-3 text-right">Current Selling</th>
                        <th className="py-2 px-3 text-right">Proposed Selling</th>
                        <th className="py-2 px-3 text-right">Price Delta</th>
                        <th className="py-2 px-3 text-right">Cost Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bulkVariants.map((v) => {
                        const currSelling = v.pricing?.sellingPrice || 0;
                        let proposedSelling = currSelling;
                        if (bulkAdjustmentType === 'PERCENT_MARKUP') {
                          proposedSelling = Math.round(currSelling * (1 + bulkAdjustmentValue / 100));
                        } else {
                          proposedSelling = Math.round(bulkAdjustmentValue * 100);
                        }
                        const delta = proposedSelling - currSelling;

                        return (
                          <tr key={v.id} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3">
                              <span className="font-semibold text-slate-900">{v.sku}</span>
                              <span className="text-3xs text-slate-400 block font-mono">
                                {Object.values(v.attributeValues || {}).join(' / ')}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                              {formatMoney(currSelling)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                              {formatMoney(proposedSelling)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-3xs font-semibold">
                              <span className={delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                {delta >= 0 ? `+${formatMoney(delta)}` : formatMoney(delta)}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-400 text-3xs">
                              {formatMoney(v.pricing?.costPrice || 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: PRICING & GST SIMULATOR                                       */}
      {/* ==================================================================== */}
      {activeTab === 'calculator' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Input Form */}
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-brand-600" />
              GST Tax Calculation Simulator
            </h2>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Pricing Treatment</label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={calcPricingType === 'TAX_EXCLUSIVE' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setCalcPricingType('TAX_EXCLUSIVE')}
                  >
                    Tax-Exclusive (Plus GST)
                  </Button>
                  <Button
                    type="button"
                    variant={calcPricingType === 'TAX_INCLUSIVE' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setCalcPricingType('TAX_INCLUSIVE')}
                  >
                    Tax-Inclusive (MRP)
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    {calcPricingType === 'TAX_INCLUSIVE' ? 'Gross Inclusive Amount (₹)' : 'Net Taxable Value (₹)'}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={calcBaseAmountRupees}
                    onChange={(e) => setCalcBaseAmountRupees(parseFloat(e.target.value) || 0)}
                    className="text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">GST Rate (%)</label>
                  <select
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                    value={calcRatePercent}
                    onChange={(e) => setCalcRatePercent(parseFloat(e.target.value) || 0)}
                  >
                    <option value={0}>0% (Nil / Exempt)</option>
                    <option value={0.25}>0.25% (Precious Stones)</option>
                    <option value={3}>3% (Gold/Jewellery)</option>
                    <option value={5}>5% (Essential)</option>
                    <option value={12}>12% (Standard Lower)</option>
                    <option value={18}>18% (Standard General)</option>
                    <option value={28}>28% (Luxury)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Origin State Code (GST)</label>
                  <Input
                    value={calcOriginState}
                    onChange={(e) => setCalcOriginState(e.target.value)}
                    placeholder="27 (Maharashtra)"
                    className="text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Destination State Code</label>
                  <Input
                    value={calcDestState}
                    onChange={(e) => setCalcDestState(e.target.value)}
                    placeholder="27 or 29"
                    className="text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Trade Discount (₹)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={calcDiscountRupees}
                  onChange={(e) => setCalcDiscountRupees(parseFloat(e.target.value) || 0)}
                  className="text-xs"
                />
                <span className="text-3xs text-slate-400 mt-0.5 block">
                  Discounts reduce the taxable base value prior to GST computation.
                </span>
              </div>
            </div>
          </Card>

          {/* Right Column: Tax Breakdown Card */}
          <Card className="p-5 space-y-4 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2 flex items-center justify-between">
              <span>GST Breakdown Result</span>
              <Badge variant={calcResult.isIntrastate ? 'brand' : 'purple'}>
                {calcResult.isIntrastate ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}
              </Badge>
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-600">Gross Item Value:</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatMoney(calcResult.grossAmountMinor)}
                </span>
              </div>

              {calcResult.discountAmountMinor > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-200 text-emerald-700">
                  <span>Trade Discount:</span>
                  <span className="font-mono font-bold">
                    -{formatMoney(calcResult.discountAmountMinor)}
                  </span>
                </div>
              )}

              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-600">Net Taxable Amount:</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatMoney(calcResult.netTaxableAmountMinor)}
                </span>
              </div>

              {/* Components */}
              <div className="space-y-1.5 py-2">
                <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Tax Components Split:
                </span>
                {calcResult.components.map((c, i) => (
                  <div key={i} className="flex justify-between font-mono text-xs pl-2">
                    <span className="text-slate-700">
                      {c.type} ({c.ratePercent}%):
                    </span>
                    <span className="font-bold text-slate-900">{formatMoney(c.amountMinor)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between py-1.5 border-t border-slate-200 font-semibold text-slate-800">
                <span>Total Tax Amount:</span>
                <span className="font-mono font-bold">{formatMoney(calcResult.totalTaxAmountMinor)}</span>
              </div>

              <div className="flex justify-between p-3 bg-brand-50 border border-brand-200 rounded-lg text-brand-900 text-sm font-bold">
                <span>Final Payable Amount:</span>
                <span className="font-mono text-base">{formatMoney(calcResult.finalAmountMinor)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Create Tax Modal */}
      {isTaxModalOpen && (
        <Modal
          isOpen={isTaxModalOpen}
          onClose={() => setIsTaxModalOpen(false)}
          title="Create GST Tax Slab Configuration"
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Slab Name</label>
              <Input
                value={taxFormName}
                onChange={(e) => setTaxFormName(e.target.value)}
                placeholder="e.g. GST 18% Standard"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Slab Code</label>
              <Input
                value={taxFormCode}
                onChange={(e) => setTaxFormCode(e.target.value.toUpperCase())}
                placeholder="GST_18"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Total Rate (%)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={taxFormRate}
                  onChange={(e) => setTaxFormRate(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Jurisdiction</label>
                <select
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                  value={taxFormJurisdiction}
                  onChange={(e) => setTaxFormJurisdiction(e.target.value as 'INDIA_GST' | 'GENERIC_VAT' | 'CUSTOM')}
                >
                  <option value="INDIA_GST">India GST</option>
                  <option value="GENERIC_VAT">Generic VAT</option>
                  <option value="CUSTOM">Custom Surcharge</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button variant="secondary" size="sm" onClick={() => setIsTaxModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => saveTaxMutation.mutate()}
                disabled={saveTaxMutation.isPending || !taxFormName || !taxFormCode}
              >
                {saveTaxMutation.isPending ? 'Saving...' : 'Save Tax Slab'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Pricing Rule Modal */}
      {isRuleModalOpen && (
        <Modal
          isOpen={isRuleModalOpen}
          onClose={() => setIsRuleModalOpen(false)}
          title="Configure Pricing Rule / Store Override"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Hierarchy Level</label>
                <select
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                  value={ruleLevel}
                  onChange={(e) => setRuleLevel(e.target.value as any)}
                >
                  <option value="STORE">Store-Level Override</option>
                  <option value="CUSTOMER_GROUP">Customer Group Wholesale Tier</option>
                  <option value="CUSTOMER">Customer-Specific Override</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Target Entity ID</label>
                <Input
                  value={ruleTargetId}
                  onChange={(e) => setRuleTargetId(e.target.value)}
                  placeholder="e.g. store_mum_01 or wholesale_tier_a"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Target Product</label>
              <select
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                value={ruleProductId}
                onChange={(e) => setRuleProductId(e.target.value)}
              >
                <option value="">-- Select Product --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>

            {selectedProductVariants.length > 0 && (
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Specific Variant (Optional — Applies to all if empty)
                </label>
                <select
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                  value={ruleVariantId}
                  onChange={(e) => setRuleVariantId(e.target.value)}
                >
                  <option value="">All Variants (Product Wide)</option>
                  {selectedProductVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.sku} ({Object.values(v.attributeValues || {}).join(' / ')})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Override Price (₹)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={rulePriceRupees}
                onChange={(e) => setRulePriceRupees(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Reason / Justification</label>
              <Input
                value={ruleReason}
                onChange={(e) => setRuleReason(e.target.value)}
                placeholder="e.g. Regional store logistics surcharge"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button variant="secondary" size="sm" onClick={() => setIsRuleModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => saveRuleMutation.mutate()}
                disabled={saveRuleMutation.isPending || !ruleTargetId || !ruleProductId || rulePriceRupees <= 0}
              >
                {saveRuleMutation.isPending ? 'Saving...' : 'Save Pricing Rule'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default PricingManagementPage;
