import { assertMinorUnits } from './money';

export type PricingType = 'TAX_INCLUSIVE' | 'TAX_EXCLUSIVE';
export type TaxComponentType = 'CGST' | 'SGST' | 'IGST' | 'CESS' | 'VAT';

export interface TaxComponentBreakdown {
  type: TaxComponentType;
  ratePercent: number;
  amountMinor: number;
}

export interface TaxCalculationInput {
  baseAmountMinor: number;
  pricingType: PricingType;
  taxRatePercent: number;
  originStateCode: string;
  destinationStateCode: string;
  discountAmountMinor?: number;
  customComponents?: Array<{
    name: string;
    ratePercent: number;
    type: TaxComponentType;
  }>;
}

export interface TaxCalculationResult {
  pricingType: PricingType;
  grossAmountMinor: number;
  discountAmountMinor: number;
  netTaxableAmountMinor: number;
  totalTaxAmountMinor: number;
  finalAmountMinor: number;
  taxRatePercent: number;
  isIntrastate: boolean;
  components: TaxComponentBreakdown[];
}

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

  const rateBps = Math.round(input.taxRatePercent * 100);

  if (input.pricingType === 'TAX_INCLUSIVE') {
    const netGross = Math.max(0, input.baseAmountMinor - discountMinor);

    if (rateBps === 0 || netGross === 0) {
      netTaxableAmountMinor = netGross;
      totalTaxAmountMinor = 0;
      finalAmountMinor = netGross;
    } else {
      netTaxableAmountMinor = Math.round((netGross * 10000) / (10000 + rateBps));
      totalTaxAmountMinor = netGross - netTaxableAmountMinor;
      finalAmountMinor = netGross;
    }
  } else {
    netTaxableAmountMinor = Math.max(0, input.baseAmountMinor - discountMinor);

    if (rateBps === 0 || netTaxableAmountMinor === 0) {
      totalTaxAmountMinor = 0;
      finalAmountMinor = netTaxableAmountMinor;
    } else {
      totalTaxAmountMinor = Math.round((netTaxableAmountMinor * rateBps) / 10000);
      finalAmountMinor = netTaxableAmountMinor + totalTaxAmountMinor;
    }
  }

  const components: TaxComponentBreakdown[] = [];

  if (totalTaxAmountMinor > 0) {
    if (input.customComponents && input.customComponents.length > 0) {
      let allocatedTax = 0;
      for (let i = 0; i < input.customComponents.length; i++) {
        const comp = input.customComponents[i];
        const isLast = i === input.customComponents.length - 1;
        const compBps = Math.round(comp.ratePercent * 100);
        let compAmt = Math.round((netTaxableAmountMinor * compBps) / 10000);
        if (isLast) {
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
      const halfRate = input.taxRatePercent / 2;
      const cgst = Math.floor(totalTaxAmountMinor / 2);
      const sgst = totalTaxAmountMinor - cgst;

      components.push(
        { type: 'CGST', ratePercent: halfRate, amountMinor: cgst },
        { type: 'SGST', ratePercent: halfRate, amountMinor: sgst }
      );
    } else {
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
  taxClassificationCode?: string;
  taxComponents: TaxComponentBreakdown[];
  totalTaxAmountMinor: number;
  finalAmountMinor: number;
  currency: string;
  originStateCode: string;
  destinationStateCode: string;
  calculatedAt: string;
}

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
