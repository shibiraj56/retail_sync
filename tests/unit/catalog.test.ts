import { describe, it, expect } from 'vitest';
import {
  UpsertCategoryInputSchema,
  UpsertBrandInputSchema,
  UpsertUomInputSchema,
  UomConversionRuleSchema,
  SafeIntegerMoneySchema,
  SYSTEM_DEFAULT_UOMS,
} from '../../src/types/catalog';

describe('Phase 2 Master Data — Unit Test Suite', () => {
  // ==========================================================================
  // 1. SAFE INTEGER MONEY SAFEGUARD TESTS
  // ==========================================================================
  describe('SafeIntegerMoneySchema', () => {
    it('should accept valid non-negative integer minor units (paise/cents)', () => {
      expect(SafeIntegerMoneySchema.safeParse(0).success).toBe(true);
      expect(SafeIntegerMoneySchema.safeParse(10050).success).toBe(true); // ₹100.50
      expect(SafeIntegerMoneySchema.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(true);
    });

    it('should reject floating-point currency numbers', () => {
      const result = SafeIntegerMoneySchema.safeParse(100.50);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('must be an integer');
      }
    });

    it('should reject negative amounts', () => {
      const result = SafeIntegerMoneySchema.safeParse(-500);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('cannot be negative');
      }
    });

    it('should reject numbers exceeding JavaScript safe integer limit', () => {
      const result = SafeIntegerMoneySchema.safeParse(Number.MAX_SAFE_INTEGER + 100);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // 2. UNITS OF MEASURE (UoM) TESTS
  // ==========================================================================
  describe('Units of Measure (UoM)', () => {
    it('should validate all 7 system default units correctly', () => {
      expect(SYSTEM_DEFAULT_UOMS).toHaveLength(7);
      const symbols = SYSTEM_DEFAULT_UOMS.map((u) => u.symbol);
      expect(symbols).toEqual(['PCS', 'KG', 'GM', 'MTR', 'LTR', 'BOX', 'SET']);

      // Integer units
      const pcs = SYSTEM_DEFAULT_UOMS.find((u) => u.symbol === 'PCS');
      expect(pcs?.allowDecimals).toBe(false);
      expect(pcs?.decimalPrecision).toBe(0);

      // Decimal units
      const kg = SYSTEM_DEFAULT_UOMS.find((u) => u.symbol === 'KG');
      expect(kg?.allowDecimals).toBe(true);
      expect(kg?.decimalPrecision).toBe(3);
    });

    it('should accept valid custom UoM payload', () => {
      const validUom = {
        organizationId: 'org_alpha',
        name: 'Dozen',
        symbol: 'dzn',
        type: 'COUNT',
        allowDecimals: false,
        decimalPrecision: 0,
      };

      const result = UpsertUomInputSchema.safeParse(validUom);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.symbol).toBe('DZN'); // Uppercase normalized
      }
    });

    it('should reject UoM if allowDecimals is false but decimalPrecision > 0', () => {
      const invalidUom = {
        organizationId: 'org_alpha',
        name: 'Piece Invalid',
        symbol: 'PIECE',
        type: 'COUNT',
        allowDecimals: false,
        decimalPrecision: 2, // Conflict!
      };

      const result = UpsertUomInputSchema.safeParse(invalidUom);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Decimal precision must be 0 when allowDecimals is false');
      }
    });

    it('should validate compatible conversion rules (1 BOX = 24 PCS)', () => {
      const validConversion = {
        baseUomId: 'uom_pcs',
        baseUomType: 'COUNT',
        secondaryUomId: 'uom_box',
        secondaryUomType: 'COUNT',
        conversionFactor: 24,
      };

      expect(UomConversionRuleSchema.safeParse(validConversion).success).toBe(true);
    });

    it('should reject incompatible cross-dimensional conversion (e.g. Weight to Length)', () => {
      const incompatibleConversion = {
        baseUomId: 'uom_kg',
        baseUomType: 'WEIGHT',
        secondaryUomId: 'uom_mtr',
        secondaryUomType: 'LENGTH',
        conversionFactor: 5,
      };

      const result = UomConversionRuleSchema.safeParse(incompatibleConversion);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('compatible measurement dimensions');
      }
    });
  });

  // ==========================================================================
  // 3. CATEGORIES SCHEMA & HIERARCHY TESTS
  // ==========================================================================
  describe('Categories Schema', () => {
    it('should accept valid Root Category (Level 1)', () => {
      const validRoot = {
        organizationId: 'org_alpha',
        name: 'Electronics',
        code: 'ELEC',
        parentId: null,
        description: 'Electronic components and appliances',
        displayOrder: 1,
      };

      const result = UpsertCategoryInputSchema.safeParse(validRoot);
      expect(result.success).toBe(true);
    });

    it('should accept valid Subcategory with HSN and Tax classification', () => {
      const validSub = {
        organizationId: 'org_alpha',
        name: 'Cables & Wires',
        code: 'ELEC-CBL',
        parentId: 'cat_electronics',
        defaultTaxClassification: {
          codeType: 'HSN',
          code: '8544',
          taxSlabId: 'gst_18',
          taxRatePercent: 18.0,
        },
        displayOrder: 2,
      };

      const result = UpsertCategoryInputSchema.safeParse(validSub);
      expect(result.success).toBe(true);
    });

    it('should reject category with invalid lowercase or special character code', () => {
      const invalidCode = {
        organizationId: 'org_alpha',
        name: 'Invalid Code Cat',
        code: 'elec@#$123', // lowercase and symbols
      };

      const result = UpsertCategoryInputSchema.safeParse(invalidCode);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('uppercase alphanumeric characters');
      }
    });

    it('should reject category with invalid HSN code (non-numeric digits)', () => {
      const invalidHsn = {
        organizationId: 'org_alpha',
        name: 'Invalid HSN Cat',
        code: 'TEST-CAT',
        defaultTaxClassification: {
          codeType: 'HSN',
          code: 'HSN8544', // contains letters
          taxSlabId: 'gst_18',
          taxRatePercent: 18.0,
        },
      };

      const result = UpsertCategoryInputSchema.safeParse(invalidHsn);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('4 to 8 numeric digits');
      }
    });
  });

  // ==========================================================================
  // 4. BRANDS SCHEMA TESTS
  // ==========================================================================
  describe('Brands Schema', () => {
    it('should accept valid brand with full metadata', () => {
      const validBrand = {
        organizationId: 'org_alpha',
        name: 'Havells',
        code: 'HVL',
        logoUrl: 'https://cdn.retail.com/logos/havells.png',
        manufacturerName: 'Havells India Ltd.',
        supportEmail: 'support@havells.com',
        supportPhone: '+911204771000',
      };

      const result = UpsertBrandInputSchema.safeParse(validBrand);
      expect(result.success).toBe(true);
    });

    it('should reject brand with invalid email', () => {
      const invalidBrand = {
        organizationId: 'org_alpha',
        name: 'Havells',
        code: 'HVL',
        supportEmail: 'not-an-email',
      };

      const result = UpsertBrandInputSchema.safeParse(invalidBrand);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Invalid support email');
      }
    });
  });

  // ==========================================================================
  // 5. TAX PRECEDENCE & MATHEMATICAL FORMULA TESTS
  // ==========================================================================
  describe('Tax & Currency Precision Calculations', () => {
    it('should calculate tax-inclusive base taxable amount without floating-point error', () => {
      // MRP ₹118.00 at 18% GST -> 11800 minor units
      const sellingPriceMinor = 11800;
      const ratePercent = 18.0;

      const taxableAmountMinor = Math.round(
        (sellingPriceMinor * 10000) / (10000 + Math.round(ratePercent * 100))
      );
      const taxAmountMinor = sellingPriceMinor - taxableAmountMinor;

      expect(taxableAmountMinor).toBe(10000); // exactly ₹100.00
      expect(taxAmountMinor).toBe(1800); // exactly ₹18.00
      expect(taxableAmountMinor + taxAmountMinor).toBe(sellingPriceMinor);
    });

    it('should calculate tax-exclusive gross amount accurately in integer minor units', () => {
      // Base Price ₹250.00 at 12% GST -> 25000 minor units
      const taxableAmountMinor = 25000;
      const ratePercent = 12.0;

      const taxAmountMinor = Math.round((taxableAmountMinor * ratePercent) / 100);
      const grossAmountMinor = taxableAmountMinor + taxAmountMinor;

      expect(taxAmountMinor).toBe(3000); // exactly ₹30.00
      expect(grossAmountMinor).toBe(28000); // exactly ₹280.00
    });
  });
});
