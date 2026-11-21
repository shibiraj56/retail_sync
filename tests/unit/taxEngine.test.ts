import { describe, it, expect } from 'vitest';
import { calculateTax, createPriceAndTaxSnapshot } from '../../src/lib/tax';

describe('GST Calculation Engine & Tax Snapshots', () => {
  describe('Tax-Exclusive Pricing Computations', () => {
    it('computes Intra-State tax (CGST + SGST) accurately on exclusive base amount', () => {
      // Base: ₹1,000.00 = 100000 paise @ 18% GST intra-state (MH 27 -> MH 27)
      const res = calculateTax({
        baseAmountMinor: 100000,
        pricingType: 'TAX_EXCLUSIVE',
        taxRatePercent: 18,
        originStateCode: '27',
        destinationStateCode: '27',
      });

      expect(res.isIntrastate).toBe(true);
      expect(res.grossAmountMinor).toBe(100000);
      expect(res.netTaxableAmountMinor).toBe(100000);
      expect(res.totalTaxAmountMinor).toBe(18000); // ₹180.00
      expect(res.finalAmountMinor).toBe(118000); // ₹1,180.00

      // Split into CGST (9%) and SGST (9%)
      expect(res.components).toHaveLength(2);
      expect(res.components[0]).toEqual({
        type: 'CGST',
        ratePercent: 9,
        amountMinor: 9000,
      });
      expect(res.components[1]).toEqual({
        type: 'SGST',
        ratePercent: 9,
        amountMinor: 9000,
      });
    });

    it('computes Inter-State tax (IGST) accurately on exclusive base amount', () => {
      // Base: ₹1,000.00 @ 18% GST inter-state (MH 27 -> KA 29)
      const res = calculateTax({
        baseAmountMinor: 100000,
        pricingType: 'TAX_EXCLUSIVE',
        taxRatePercent: 18,
        originStateCode: '27',
        destinationStateCode: '29',
      });

      expect(res.isIntrastate).toBe(false);
      expect(res.grossAmountMinor).toBe(100000);
      expect(res.netTaxableAmountMinor).toBe(100000);
      expect(res.totalTaxAmountMinor).toBe(18000);
      expect(res.finalAmountMinor).toBe(118000);

      // Single component: IGST (18%)
      expect(res.components).toHaveLength(1);
      expect(res.components[0]).toEqual({
        type: 'IGST',
        ratePercent: 18,
        amountMinor: 18000,
      });
    });

    it('correctly applies trade discounts before tax calculation', () => {
      // Base: ₹1,000.00, Discount: ₹200.00 (20000 paise), Taxable: ₹800.00 @ 18%
      const res = calculateTax({
        baseAmountMinor: 100000,
        pricingType: 'TAX_EXCLUSIVE',
        taxRatePercent: 18,
        discountAmountMinor: 20000,
        originStateCode: '27',
        destinationStateCode: '27',
      });

      expect(res.grossAmountMinor).toBe(100000);
      expect(res.discountAmountMinor).toBe(20000);
      expect(res.netTaxableAmountMinor).toBe(80000); // ₹800.00
      expect(res.totalTaxAmountMinor).toBe(14400); // 18% of 800.00 = 144.00
      expect(res.finalAmountMinor).toBe(94400); // ₹944.00
    });
  });

  describe('Tax-Inclusive Pricing Computations (MRP Back-Calculation)', () => {
    it('back-calculates taxable base and tax from MRP correctly', () => {
      // MRP: ₹1,180.00 (118000 paise) @ 18% GST
      // Taxable = 118000 * 10000 / 11800 = 100000 paise
      const res = calculateTax({
        baseAmountMinor: 118000,
        pricingType: 'TAX_INCLUSIVE',
        taxRatePercent: 18,
        originStateCode: '27',
        destinationStateCode: '27',
      });

      expect(res.grossAmountMinor).toBe(118000);
      expect(res.netTaxableAmountMinor).toBe(100000); // Base value
      expect(res.totalTaxAmountMinor).toBe(18000); // Included tax
      expect(res.finalAmountMinor).toBe(118000); // Total stays equal to MRP
      expect(res.components[0].amountMinor).toBe(9000); // CGST
      expect(res.components[1].amountMinor).toBe(9000); // SGST
    });

    it('handles inclusive prices with discounts correctly', () => {
      // MRP ₹1,000.00 (100000 paise), Discount ₹100.00 (10000 paise) -> Net MRP ₹900.00 (90000 paise)
      // At 5% GST:
      // Taxable = round(90000 * 10000 / 10500) = 85714 paise (₹857.14)
      // Tax = 90000 - 85714 = 4286 paise (₹42.86)
      const res = calculateTax({
        baseAmountMinor: 100000,
        pricingType: 'TAX_INCLUSIVE',
        taxRatePercent: 5,
        discountAmountMinor: 10000,
        originStateCode: '27',
        destinationStateCode: '27',
      });

      expect(res.grossAmountMinor).toBe(100000);
      expect(res.discountAmountMinor).toBe(10000);
      expect(res.finalAmountMinor).toBe(90000);
      expect(res.netTaxableAmountMinor).toBe(85714);
      expect(res.totalTaxAmountMinor).toBe(4286);
      expect(res.netTaxableAmountMinor + res.totalTaxAmountMinor).toBe(res.finalAmountMinor);
    });
  });

  describe('Odd-Paise Splitting & Component Balancing', () => {
    it('balances intra-state odd tax amounts without dropping or gaining any paisa', () => {
      // Base: ₹1.00 (100 paise) @ 15% GST -> total tax = round(15) = 15 paise
      // Splitting 15 / 2 gives 7.5.
      // Floor gives CGST = 7 paise, Remainder gives SGST = 8 paise. Sum = 15 paise.
      const res = calculateTax({
        baseAmountMinor: 100,
        pricingType: 'TAX_EXCLUSIVE',
        taxRatePercent: 15,
        originStateCode: '27',
        destinationStateCode: '27',
      });

      expect(res.totalTaxAmountMinor).toBe(15);
      const cgst = res.components.find((c) => c.type === 'CGST')?.amountMinor ?? 0;
      const sgst = res.components.find((c) => c.type === 'SGST')?.amountMinor ?? 0;

      expect(cgst + sgst).toBe(15);
      expect(cgst).toBe(7);
      expect(sgst).toBe(8);
    });

    it('handles 0% exempt tax correctly', () => {
      const res = calculateTax({
        baseAmountMinor: 50000,
        pricingType: 'TAX_EXCLUSIVE',
        taxRatePercent: 0,
        originStateCode: '27',
        destinationStateCode: '27',
      });

      expect(res.totalTaxAmountMinor).toBe(0);
      expect(res.finalAmountMinor).toBe(50000);
      expect(res.components).toHaveLength(0);
    });
  });

  describe('Price and Tax Snapshots', () => {
    it('creates an immutable frozen price and tax snapshot for sales line items', () => {
      const snapshot = createPriceAndTaxSnapshot({
        productId: 'prod_123',
        productName: 'Organic Basmati Rice 1kg',
        variantId: 'var_123_1kg',
        sku: 'RICE-BAS-1KG',
        unitPriceMinor: 15000, // ₹150.00
        pricingType: 'TAX_INCLUSIVE',
        taxRatePercent: 5,
        taxClassificationCode: 'GST_5',
        originStateCode: '27',
        destinationStateCode: '27',
        pricingSourceRuleId: 'rule_store_nashik',
        pricingLevel: 'STORE',
      });

      expect(snapshot.productId).toBe('prod_123');
      expect(snapshot.variantId).toBe('var_123_1kg');
      expect(snapshot.sku).toBe('RICE-BAS-1KG');
      expect(snapshot.unitPriceMinor).toBe(15000);
      expect(snapshot.pricingType).toBe('TAX_INCLUSIVE');
      expect(snapshot.taxRatePercent).toBe(5);
      expect(snapshot.pricingSourceRuleId).toBe('rule_store_nashik');
      expect(snapshot.pricingLevel).toBe('STORE');
      expect(snapshot.netTaxableAmountMinor).toBe(14286);
      expect(snapshot.totalTaxAmountMinor).toBe(714);
      expect(snapshot.finalAmountMinor).toBe(15000);
      expect(snapshot.calculatedAt).toBeDefined();
    });
  });
});
