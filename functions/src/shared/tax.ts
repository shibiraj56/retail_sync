import { assertMinorUnits } from './money';

// ============================================================================
// GST & TAX CALCULATION ENGINE (INDIA GST & CONFIGURABLE JURISDICTIONS)
// ============================================================================

export type PricingType = 'TAX_INCLUSIVE' | 'TAX_EXCLUSIVE';
export type TaxComponentType = 'CGST' | 'SGST' | 'IGST' | 'CESS' | 'VAT';

export interface TaxComponentBreakdown {
  type: TaxComponentType;
  ratePercent: number;
  amountMinor: number; // in paise
}

export interface TaxCalculationInput {
  baseAmountMinor: number; // Total item amount before or including tax, in paise
  pricingType: PricingType;
  taxRatePercent: number; // e.g. 0, 5, 12, 18, 28
  originStateCode: string; // e.g. "27" (Maharashtra)
  destinationStateCode: string; // e.g. "27" or "29" (Karnataka)
  discountAmountMinor?: number; // Optional item-level discount, in paise
  customComponents?: Array<{
    name: string;
    ratePercent: number;
    type: TaxComponentType;
  }>;
}

export interface TaxCalculationResult {
  pricingType: PricingType;
  grossAmountMinor: number; // Input amount in paise
  discountAmountMinor: number; // Discount applied in paise
  netTaxableAmountMinor: number; // Taxable base value in paise
  totalTaxAmountMinor: number; // Total tax in paise
  finalAmountMinor: number; // Final payable amount (Taxable + Tax) in paise
  taxRatePercent: number;
  isIntrastate: boolean;
  components: TaxComponentBreakdown[];
}

/**
 * Calculates GST components with integer minor-unit arithmetic and deterministic odd-paise balancing.
 */
export function calculateTax(input: TaxCalculationInput): TaxCalculationResult {
  assertMinorUnits(input.baseAmountMinor, 'Base Amount');
  const discountMinor = input.discountAmountMinor || 0;
  assertMinorUnits(discountMinor, 'Discount Amount');

  if (input.taxRatePercent < 0 || input.taxRatePercent > 100) {
    throw new RangeError(`Tax rate percent must be between 0 and 100, received: ${input.taxRatePercent}`);
  }

  const isIntrastate =
    input.originStateCode.trim().toUpperCase() ===
    input.destinationStateCode.trim().toUpperCase();

  let netTaxableAmountMinor = 0;
  let totalTaxAmountMinor = 0;
  let finalAmountMinor = 0;

  // Rate in basis points (e.g. 18.00% -> 1800 basis points)
  const rateBps = Math.round(input.taxRatePercent * 100);

  if (input.pricingType === 'TAX_INCLUSIVE') {
    // 1. TAX INCLUSIVE
    // Gross contains tax. Deduct discount from gross first:
    const netGross = Math.max(0, input.baseAmountMinor - discountMinor);

    if (rateBps === 0 || netGross === 0) {
      netTaxableAmountMinor = netGross;
      totalTaxAmountMinor = 0;
      finalAmountMinor = netGross;
    } else {
      // Formula: Taxable Base = round( (NetGross * 10000) / (10000 + RateBps) )
      netTaxableAmountMinor = Math.round((netGross * 10000) / (10000 + rateBps));
      totalTaxAmountMinor = netGross - netTaxableAmountMinor;
      finalAmountMinor = netGross;
    }
  } else {
    // 2. TAX EXCLUSIVE
    // Base is net taxable. Deduct discount from base first:
    netTaxableAmountMinor = Math.max(0, input.baseAmountMinor - discountMinor);

    if (rateBps === 0 || netTaxableAmountMinor === 0) {
      totalTaxAmountMinor = 0;
      finalAmountMinor = netTaxableAmountMinor;
    } else {
      // Formula: Tax = round( (NetTaxable * RateBps) / 10000 )
      totalTaxAmountMinor = Math.round((netTaxableAmountMinor * rateBps) / 10000);
      finalAmountMinor = netTaxableAmountMinor + totalTaxAmountMinor;
    }
  }

  // Breakdown into components
  const components: TaxComponentBreakdown[] = [];

  if (totalTaxAmountMinor > 0) {
    if (input.customComponents && input.customComponents.length > 0) {
      // Custom organization-configured components
      let allocatedTax = 0;
      for (let i = 0; i < input.customComponents.length; i++) {
        const comp = input.customComponents[i];
        const isLast = i === input.customComponents.length - 1;
        const compBps = Math.round(comp.ratePercent * 100);
        let compAmt = Math.round((netTaxableAmountMinor * compBps) / 10000);
        if (isLast) {
          // Balance out any rounding residue
          compAmt = totalTaxAmountMinor - allocatedTax;
        } else {
          allocatedTax += compAmt;
        }
        components.push({
          type: comp.type,
          ratePercent: comp.ratePercent,
          amountMinor: compAmt,
        });
      }
    } else if (isIntrastate) {
      // Intra-state standard split: CGST (50%) + SGST (50%)
      const halfRate = input.taxRatePercent / 2;
      const cgst = Math.floor(totalTaxAmountMinor / 2);
      const sgst = totalTaxAmountMinor - cgst; // Resolves odd-paise split perfectly

      components.push(
        { type: 'CGST', ratePercent: halfRate, amountMinor: cgst },
        { type: 'SGST', ratePercent: halfRate, amountMinor: sgst }
      );
    } else {
      // Inter-state standard: IGST (100%)
      components.push({
        type: 'IGST',
        ratePercent: input.taxRatePercent,
        amountMinor: totalTaxAmountMinor,
      });
    }
  }

  return {
    pricingType: input.pricingType,
    grossAmountMinor: input.baseAmountMinor,
    discountAmountMinor: discountMinor,
    netTaxableAmountMinor,
    totalTaxAmountMinor,
    finalAmountMinor,
    taxRatePercent: input.taxRatePercent,
    isIntrastate,
    components,
  };
}

// ============================================================================
// IMMUTABLE PRICE & TAX TRANSACTION SNAPSHOT MODEL
// ============================================================================

export interface PriceAndTaxSnapshot {
  productId: string;
  variantId?: string;
  productName: string;
  sku: string;
  barcode?: string;
  pricingLevel: 'ORGANIZATION' | 'STORE' | 'PRODUCT' | 'VARIANT' | 'CUSTOMER_GROUP' | 'CUSTOMER';
  pricingSourceRuleId?: string;
  unitPriceMinor: number;
  discountMinor: number;
  netTaxableAmountMinor: number;
  pricingType: PricingType;
  taxRatePercent: number;
  taxClassificationCode?: string; // HSN/SAC
  taxComponents: TaxComponentBreakdown[];
  totalTaxAmountMinor: number;
  finalAmountMinor: number;
  currency: string;
  originStateCode: string;
  destinationStateCode: string;
  calculatedAt: string; // ISO 8601 string
}

/**
 * Creates a frozen, immutable snapshot for future POS sale line items or invoices.
 */
export function createPriceAndTaxSnapshot(params: {
  productId: string;
  variantId?: string;
  productName: string;
  sku: string;
  barcode?: string;
  pricingLevel: 'ORGANIZATION' | 'STORE' | 'PRODUCT' | 'VARIANT' | 'CUSTOMER_GROUP' | 'CUSTOMER';
  pricingSourceRuleId?: string;
  unitPriceMinor: number;
  discountMinor?: number;
  pricingType: PricingType;
  taxRatePercent: number;
  taxClassificationCode?: string;
  originStateCode: string;
  destinationStateCode: string;
  currency?: string;
  calculatedAt?: string;
}): PriceAndTaxSnapshot {
  const taxCalc = calculateTax({
    baseAmountMinor: params.unitPriceMinor,
    pricingType: params.pricingType,
    taxRatePercent: params.taxRatePercent,
    originStateCode: params.originStateCode,
    destinationStateCode: params.destinationStateCode,
    discountAmountMinor: params.discountMinor || 0,
  });

  return {
    productId: params.productId,
    variantId: params.variantId,
    productName: params.productName,
    sku: params.sku,
    barcode: params.barcode,
    pricingLevel: params.pricingLevel,
    pricingSourceRuleId: params.pricingSourceRuleId,
    unitPriceMinor: params.unitPriceMinor,
    discountMinor: params.discountMinor || 0,
    netTaxableAmountMinor: taxCalc.netTaxableAmountMinor,
    pricingType: params.pricingType,
    taxRatePercent: params.taxRatePercent,
    taxClassificationCode: params.taxClassificationCode,
    taxComponents: taxCalc.components,
    totalTaxAmountMinor: taxCalc.totalTaxAmountMinor,
    finalAmountMinor: taxCalc.finalAmountMinor,
    currency: params.currency || 'INR',
    originStateCode: params.originStateCode,
    destinationStateCode: params.destinationStateCode,
    calculatedAt: params.calculatedAt || new Date().toISOString(),
  };
}
