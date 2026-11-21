import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Layers,
  Plus,
  Trash2,
  Sparkles,
  Barcode as BarcodeIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  Save,
  Tag,
  Hash,
  Sliders,
} from 'lucide-react';
import {
  fetchVariants,
  saveVariantsSync,
  archiveVariant,
  createVariantMatrixJob,
  acquireJobLease,
  processJobChunk,
} from '../../../services/variantService';
import type {
  VariantAxis,
  UpsertVariantItem,
} from '../../../types/variants';
import type { ProductDocument } from '../../../types/catalog';
import {
  validateVariantAxes,
  generateCartesianCombinations,
  generateDeterministicVariantId,
  generateSkuFromTemplate,
  detectAndValidateBarcode,
  validateSku,
} from '../../../lib/identifiers';
import { Button } from '../../../components/common/Button';
import { Input } from '../../../components/common/Input';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import { Modal } from '../../../components/common/Modal';

interface VariantMatrixManagerProps {
  organizationId: string;
  product: ProductDocument;
}

export const VariantMatrixManager: React.FC<VariantMatrixManagerProps> = ({
  organizationId,
  product,
}) => {
  const queryClient = useQueryClient();
  const [activeSubTab, setActiveSubTab] = useState<'existing' | 'matrix'>('existing');

  // Axes state
  const [axes, setAxes] = useState<VariantAxis[]>([
    { name: 'Size', values: ['S', 'M', 'L'] },
    { name: 'Color', values: ['Black', 'Navy'] },
  ]);
  const [newAxisName, setNewAxisName] = useState('');
  const [newValueInputs, setNewValueInputs] = useState<Record<number, string>>({});

  // SKU template
  const [skuTemplate, setSkuTemplate] = useState('{PRODUCT_CODE}-{INDEX_PAD}');

  // Default pricing for matrix generation (in Rupees)
  const [defaultMrp, setDefaultMrp] = useState<number>(999);
  const [defaultSellingPrice, setDefaultSellingPrice] = useState<number>(799);
  const [defaultCostPrice, setDefaultCostPrice] = useState<number>(450);

  // Generated preview variants
  const [previewItems, setPreviewItems] = useState<UpsertVariantItem[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Background Job execution state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<{
    status: string;
    totalChunks: number;
    currentChunk: number;
    processed: number;
    total: number;
    failed: number;
  } | null>(null);
  const [isProcessingJob, setIsProcessingJob] = useState(false);

  // Archive modal
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);

  // Query existing variants
  const { data: existingVariants = [], isLoading: isLoadingExisting } = useQuery({
    queryKey: ['productVariants', organizationId, product.id],
    queryFn: () => fetchVariants(organizationId, product.id),
  });

  // Automatically switch tab if no variants exist yet
  useEffect(() => {
    if (!isLoadingExisting && existingVariants.length === 0) {
      setActiveSubTab('matrix');
    }
  }, [isLoadingExisting, existingVariants.length]);

  // Compute live validation of axes
  const axesValidation = useMemo(() => {
    return validateVariantAxes(axes);
  }, [axes]);

  // Compute live Cartesian preview
  useEffect(() => {
    if (!axesValidation.valid) {
      setPreviewItems([]);
      return;
    }

    const combos = generateCartesianCombinations(axesValidation.validatedAxes);
    const productCode = product.code || 'PRD';

    const items: UpsertVariantItem[] = combos.map((combo, idx) => {
      const deterministicId = generateDeterministicVariantId(product.id, combo);
      const generatedSku = generateSkuFromTemplate(skuTemplate, {
        productCode,
        attributes: combo,
        index: idx + 1,
      });

      return {
        id: deterministicId,
        sku: generatedSku,
        barcode: '',
        additionalBarcodes: [],
        attributeValues: combo,
        pricing: {
          mrp: Math.round(defaultMrp * 100),
          sellingPrice: Math.round(defaultSellingPrice * 100),
          costPrice: Math.round(defaultCostPrice * 100),
        },
        taxRatePercent: product.taxData?.taxRatePercent || 0,
        trackInventory: true,
        reorderPoint: 5,
        status: 'ACTIVE',
      };
    });

    setPreviewItems(items);
  }, [axes, axesValidation, skuTemplate, defaultMrp, defaultSellingPrice, defaultCostPrice, product]);

  // Synchronous Save Mutation
  const saveSyncMutation = useMutation({
    mutationFn: () => {
      if (previewItems.length > 50) {
        throw new Error('Matrix exceeds 50 variants. Use staged background processing.');
      }
      return saveVariantsSync({
        organizationId,
        productId: product.id,
        axes,
        variants: previewItems,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['productVariants', organizationId, product.id] });
      queryClient.invalidateQueries({ queryKey: ['product', organizationId, product.id] });
      setActionSuccess(`Successfully created ${data.savedVariantsCount} variants!`);
      setActiveSubTab('existing');
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to save variants');
    },
  });

  // Archive Mutation
  const archiveMutation = useMutation({
    mutationFn: (variantId: string) => archiveVariant(organizationId, product.id, variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productVariants', organizationId, product.id] });
      setArchiveTargetId(null);
      setActionSuccess('Variant archived and identifier retired');
      setTimeout(() => setActionSuccess(null), 3500);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to archive variant');
      setArchiveTargetId(null);
    },
  });

  // Axis Management
  const handleAddAxis = () => {
    const trimmed = newAxisName.trim();
    if (!trimmed) return;
    if (axes.length >= 3) {
      setValidationError('Maximum of 3 axes supported');
      return;
    }
    if (axes.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) {
      setValidationError(`Axis '${trimmed}' already exists`);
      return;
    }
    setAxes([...axes, { name: trimmed, values: ['Default'] }]);
    setNewAxisName('');
    setValidationError(null);
  };

  const handleRemoveAxis = (index: number) => {
    if (axes.length <= 1) {
      setValidationError('At least one variant axis is required');
      return;
    }
    const updated = axes.filter((_, i) => i !== index);
    setAxes(updated);
    setValidationError(null);
  };

  const handleAddValue = (axisIndex: number) => {
    const val = (newValueInputs[axisIndex] || '').trim();
    if (!val) return;
    const axis = axes[axisIndex];
    if (axis.values.some((v) => v.toLowerCase() === val.toLowerCase())) {
      setValidationError(`Value '${val}' already exists in ${axis.name}`);
      return;
    }
    const updated = [...axes];
    updated[axisIndex] = {
      ...axis,
      values: [...axis.values, val],
    };
    setAxes(updated);
    setNewValueInputs({ ...newValueInputs, [axisIndex]: '' });
    setValidationError(null);
  };

  const handleRemoveValue = (axisIndex: number, valueIndex: number) => {
    const axis = axes[axisIndex];
    if (axis.values.length <= 1) {
      setValidationError(`Axis '${axis.name}' must retain at least one value`);
      return;
    }
    const updated = [...axes];
    updated[axisIndex] = {
      ...axis,
      values: axis.values.filter((_, i) => i !== valueIndex),
    };
    setAxes(updated);
    setValidationError(null);
  };

  const handleItemFieldChange = (index: number, field: string, value: any) => {
    const updated = [...previewItems];
    if (field.startsWith('pricing.')) {
      const priceKey = field.split('.')[1] as keyof UpsertVariantItem['pricing'];
      const paiseValue = Math.round(Number(value) * 100);
      updated[index] = {
        ...updated[index],
        pricing: {
          ...updated[index].pricing,
          [priceKey]: paiseValue,
        },
      };
    } else {
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
    }
    setPreviewItems(updated);
  };

  // Background Job Handler for Large Matrices
  const handleStartLargeMatrixJob = async () => {
    try {
      setIsProcessingJob(true);
      setActionError(null);
      const workerId = `worker_${Math.random().toString(36).substring(2, 9)}`;

      // 1. Initialize staged job
      const jobInit = await createVariantMatrixJob({
        organizationId,
        productId: product.id,
        axes,
        skuTemplate,
        defaultPricing: {
          mrp: Math.round(defaultMrp * 100),
          sellingPrice: Math.round(defaultSellingPrice * 100),
          costPrice: Math.round(defaultCostPrice * 100),
        },
        defaultTaxRatePercent: product.taxData?.taxRatePercent || 0,
        defaultTrackInventory: true,
      });

      setActiveJobId(jobInit.jobId);
      setJobProgress({
        status: 'PROCESSING',
        totalChunks: jobInit.totalChunks,
        currentChunk: 0,
        processed: 0,
        total: jobInit.totalCombinations,
        failed: 0,
      });

      // 2. Loop through chunks sequentially with lease acquisition
      let currentToken = jobInit.fencingToken;
      for (let chunkIdx = 0; chunkIdx < jobInit.totalChunks; chunkIdx++) {
        // Acquire / renew lease
        const lease = await acquireJobLease({
          organizationId,
          jobId: jobInit.jobId,
          workerId,
        });
        currentToken = lease.fencingToken;

        // Process chunk
        const chunkRes = await processJobChunk({
          organizationId,
          jobId: jobInit.jobId,
          workerId,
          expectedFencingToken: currentToken,
        });

        setJobProgress({
          status: chunkRes.status,
          totalChunks: chunkRes.totalChunks,
          currentChunk: chunkRes.currentChunkIndex,
          processed: chunkRes.processedCount,
          total: jobInit.totalCombinations,
          failed: chunkRes.failedCount,
        });

        if (chunkRes.isFinished) {
          break;
        }
      }

      setIsProcessingJob(false);
      queryClient.invalidateQueries({ queryKey: ['productVariants', organizationId, product.id] });
      queryClient.invalidateQueries({ queryKey: ['product', organizationId, product.id] });
      setActionSuccess(`Staged background job completed successfully!`);
      setActiveSubTab('existing');
    } catch (err: any) {
      setIsProcessingJob(false);
      setActionError(err.message || 'Background matrix job failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={activeSubTab === 'existing' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveSubTab('existing')}
            className="flex items-center gap-1.5"
          >
            <Tag className="w-4 h-4" />
            Existing Variants ({existingVariants.length})
          </Button>

          <Button
            type="button"
            variant={activeSubTab === 'matrix' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveSubTab('matrix')}
            className="flex items-center gap-1.5"
          >
            <Sliders className="w-4 h-4" />
            Matrix Generator & SKUs
          </Button>
        </div>

        <div className="text-xs text-slate-500 font-mono">
          Product: <span className="font-bold text-slate-700">{product.code}</span>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* TAB 1: EXISTING VARIANTS */}
      {activeSubTab === 'existing' && (
        <div className="space-y-4">
          {isLoadingExisting ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading variants...</div>
          ) : existingVariants.length === 0 ? (
            <Card className="p-8 text-center space-y-3">
              <Layers className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">No Variants Created Yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                This product currently has no variants configured. Use the Matrix Generator to define attribute axes (e.g. Size, Color) and assign unique SKUs and barcodes.
              </p>
              <Button variant="primary" size="sm" onClick={() => setActiveSubTab('matrix')}>
                Open Matrix Generator &rarr;
              </Button>
            </Card>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-3xs font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Variant / Attributes</th>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3">Barcode (Type)</th>
                    <th className="py-2.5 px-3 text-right">MRP</th>
                    <th className="py-2.5 px-3 text-right">Selling Price</th>
                    <th className="py-2.5 px-3 text-right">Cost Price</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {existingVariants.map((v) => {
                    const bcInfo = v.barcode ? detectAndValidateBarcode(v.barcode) : null;
                    return (
                      <tr key={v.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">
                            {Object.entries(v.attributeValues || {})
                              .map(([k, val]) => `${k}: ${val}`)
                              .join(' | ')}
                          </div>
                          <div className="text-3xs font-mono text-slate-400 mt-0.5 truncate max-w-[150px]">
                            {v.id}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                          {v.sku}
                        </td>
                        <td className="py-2.5 px-3">
                          {v.barcode ? (
                            <div className="flex items-center gap-1.5">
                              <BarcodeIcon className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-mono text-3xs">{v.barcode}</span>
                              {bcInfo && (
                                <Badge variant="neutral" className="text-3xs py-0 px-1">
                                  {bcInfo.type}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-3xs">None</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">
                          ₹{((v.pricing?.mrp || 0) / 100).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          ₹{((v.pricing?.sellingPrice || 0) / 100).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">
                          ₹{((v.pricing?.costPrice || 0) / 100).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge
                            variant={
                              v.status === 'ACTIVE'
                                ? 'success'
                                : v.status === 'ARCHIVED'
                                ? 'neutral'
                                : 'warning'
                            }
                          >
                            {v.status}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {v.status !== 'ARCHIVED' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="text-rose-600 hover:text-rose-700 py-1 px-2 text-3xs"
                              onClick={() => setArchiveTargetId(v.id)}
                            >
                              Archive
                            </Button>
                          )}
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

      {/* TAB 2: MATRIX GENERATOR */}
      {activeSubTab === 'matrix' && (
        <div className="space-y-6">
          {/* Section 1: Axis Configuration */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-brand-600" />
                  Attribute Axes Configuration (1 to 3 Axes)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Define variation dimensions (e.g., Size, Color, Style). Combinations are generated automatically.
                </p>
              </div>

              {axes.length < 3 && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="New Axis Name (e.g. Fit)"
                    value={newAxisName}
                    onChange={(e) => setNewAxisName(e.target.value)}
                    className="w-44 text-xs h-8"
                  />
                  <Button variant="secondary" size="sm" onClick={handleAddAxis}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Axis
                  </Button>
                </div>
              )}
            </div>

            {validationError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {axes.map((axis, axisIdx) => (
                <div
                  key={axisIdx}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Axis {axisIdx + 1}: {axis.name}
                    </span>
                    {axes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAxis(axisIdx)}
                        className="text-slate-400 hover:text-rose-600 transition-colors"
                        title="Remove Axis"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Attribute Values Pills */}
                  <div className="flex flex-wrap gap-1.5 min-h-[36px]">
                    {axis.values.map((val, valIdx) => (
                      <span
                        key={valIdx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 text-slate-800 rounded-full text-xs font-medium shadow-2xs"
                      >
                        {val}
                        <button
                          type="button"
                          onClick={() => handleRemoveValue(axisIdx, valIdx)}
                          className="hover:text-rose-600 text-slate-400"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Add Value Input */}
                  <div className="flex gap-1.5 pt-1">
                    <Input
                      placeholder={`Add ${axis.name}...`}
                      value={newValueInputs[axisIdx] || ''}
                      onChange={(e) =>
                        setNewValueInputs({ ...newValueInputs, [axisIdx]: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddValue(axisIdx);
                        }
                      }}
                      className="text-xs h-7"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 px-2.5"
                      onClick={() => handleAddValue(axisIdx)}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Section 2: SKU Template & Default Pricing */}
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <Hash className="w-4 h-4 text-brand-600" />
              SKU Generation Template & Default Pricing
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div className="md:col-span-1 space-y-1">
                <label className="font-semibold text-slate-700">SKU Template</label>
                <Input
                  value={skuTemplate}
                  onChange={(e) => setSkuTemplate(e.target.value)}
                  placeholder="{PRODUCT_CODE}-{INDEX_PAD}"
                  className="font-mono text-xs"
                />
                <span className="text-3xs text-slate-400 block">
                  Placeholders: {'{CODE}'}, {'{SIZE}'}, {'{COLOR}'}, {'{INDEX_PAD}'}
                </span>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Default MRP (₹)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={defaultMrp}
                  onChange={(e) => setDefaultMrp(parseFloat(e.target.value) || 0)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Default Selling Price (₹)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={defaultSellingPrice}
                  onChange={(e) => setDefaultSellingPrice(parseFloat(e.target.value) || 0)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Default Cost Price (₹)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={defaultCostPrice}
                  onChange={(e) => setDefaultCostPrice(parseFloat(e.target.value) || 0)}
                  className="text-xs"
                />
              </div>
            </div>
          </Card>

          {/* Section 3: Generated Combinations Preview & Inline Table */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-600" />
                  Generated Combinations Preview ({previewItems.length} Variants)
                </h3>
                <p className="text-xs text-slate-500">
                  Deterministic IDs and SKUs generated automatically. Review and edit values before saving.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {previewItems.length <= 50 ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => saveSyncMutation.mutate()}
                    disabled={saveSyncMutation.isPending || previewItems.length === 0}
                    className="flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    {saveSyncMutation.isPending
                      ? 'Saving Batch...'
                      : `Save ${previewItems.length} Variants (Synchronous)`}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleStartLargeMatrixJob}
                    disabled={isProcessingJob}
                    className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700"
                  >
                    <Clock className="w-4 h-4" />
                    {isProcessingJob
                      ? 'Processing Staged Chunks...'
                      : `Stage Matrix Background Job (${previewItems.length} items)`}
                  </Button>
                )}
              </div>
            </div>

            {/* Background Job Progress Bar */}
            {jobProgress && (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-purple-900">
                  <span>
                    Staged Job ({activeJobId}): Chunk {jobProgress.currentChunk} of {jobProgress.totalChunks}
                  </span>
                  <span>
                    {jobProgress.processed} / {jobProgress.total} processed (
                    {Math.round((jobProgress.processed / (jobProgress.total || 1)) * 100)}%)
                  </span>
                </div>
                <div className="w-full bg-purple-200 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-purple-600 h-full transition-all duration-300"
                    style={{
                      width: `${(jobProgress.processed / (jobProgress.total || 1)) * 100}%`,
                    }}
                  />
                </div>
                {jobProgress.failed > 0 && (
                  <span className="text-3xs text-rose-600 font-medium block">
                    {jobProgress.failed} items encountered collision or validation failures
                  </span>
                )}
              </div>
            )}

            {/* Matrix Items Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[500px]">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-3xs font-semibold">
                  <tr>
                    <th className="py-2 px-3 w-12">#</th>
                    <th className="py-2 px-3">Combination</th>
                    <th className="py-2 px-3">SKU</th>
                    <th className="py-2 px-3">Barcode (EAN/UPC/Custom)</th>
                    <th className="py-2 px-3 w-28">MRP (₹)</th>
                    <th className="py-2 px-3 w-28">Selling (₹)</th>
                    <th className="py-2 px-3 w-28">Cost (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewItems.slice(0, 50).map((item, idx) => {
                    const skuRes = validateSku(item.sku);
                    const bcRes = item.barcode ? detectAndValidateBarcode(item.barcode) : null;
                    return (
                      <tr key={item.id || idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-mono text-3xs text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-slate-900">
                            {Object.values(item.attributeValues).join(' / ')}
                          </span>
                          <span className="text-3xs font-mono text-slate-400 block truncate max-w-[120px]">
                            {item.id}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <Input
                            value={item.sku}
                            onChange={(e) => handleItemFieldChange(idx, 'sku', e.target.value)}
                            className={`h-7 text-xs font-mono font-bold ${
                              !skuRes.valid ? 'border-rose-400 bg-rose-50' : ''
                            }`}
                          />
                          {!skuRes.valid && (
                            <span className="text-3xs text-rose-600 block">{skuRes.error}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            <Input
                              placeholder="Scan or enter barcode"
                              value={item.barcode}
                              onChange={(e) => handleItemFieldChange(idx, 'barcode', e.target.value)}
                              className={`h-7 text-xs font-mono ${
                                bcRes && !bcRes.valid ? 'border-rose-400 bg-rose-50' : ''
                              }`}
                            />
                            {bcRes && (
                              <Badge
                                variant={bcRes.valid ? 'success' : 'danger'}
                                className="text-3xs py-0.5 px-1.5 shrink-0"
                              >
                                {bcRes.valid ? bcRes.type : 'Invalid'}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <Input
                            type="number"
                            step="0.01"
                            value={(item.pricing.mrp / 100).toFixed(2)}
                            onChange={(e) =>
                              handleItemFieldChange(idx, 'pricing.mrp', e.target.value)
                            }
                            className="h-7 text-xs"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <Input
                            type="number"
                            step="0.01"
                            value={(item.pricing.sellingPrice / 100).toFixed(2)}
                            onChange={(e) =>
                              handleItemFieldChange(idx, 'pricing.sellingPrice', e.target.value)
                            }
                            className="h-7 text-xs"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <Input
                            type="number"
                            step="0.01"
                            value={(item.pricing.costPrice / 100).toFixed(2)}
                            onChange={(e) =>
                              handleItemFieldChange(idx, 'pricing.costPrice', e.target.value)
                            }
                            className="h-7 text-xs"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {previewItems.length > 50 && (
                <div className="p-3 bg-slate-50 text-center text-xs text-slate-500 border-t border-slate-200">
                  Showing first 50 of {previewItems.length} combinations. Use Staged Background Processing to generate all combinations safely.
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Archive Modal */}
      {archiveTargetId && (
        <Modal
          isOpen={!!archiveTargetId}
          onClose={() => setArchiveTargetId(null)}
          title="Confirm Variant Archival"
        >
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs space-y-1">
              <p className="font-semibold">Permanently archive this variant?</p>
              <p>
                Its SKU and associated barcodes will be transitioned to{' '}
                <span className="font-mono font-bold">RESERVED_ARCHIVED</span> in the organization registry and permanently reserved.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setArchiveTargetId(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-rose-600 hover:bg-rose-700"
                onClick={() => archiveMutation.mutate(archiveTargetId)}
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
};
