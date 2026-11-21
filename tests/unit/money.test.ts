import { describe, it, expect } from 'vitest';
import {
  rupeesToPaise,
  paiseToRupees,
  roundHalfUp,
  formatMoney,
  validatePriceRelationship,
  assertSafeMoneyMinor,
  MAX_SAFE_MONEY_PAISE,
} from '../../src/lib/money';

describe('Money and Currency Safe Integer Engine', () => {
  describe('Minor Unit (Paise) Conversion & Precision', () => {
    it('accurately converts standard Rupee values to paise without floating point issues', () => {
      expect(rupeesToPaise(100.5)).toBe(10050);
      expect(rupeesToPaise(0.01)).toBe(1);
      expect(rupeesToPaise(0)).toBe(0);
      expect(rupeesToPaise(499.99)).toBe(49999);
      expect(rupeesToPaise(123456.78)).toBe(12345678);
    });

    it('accurately converts paise back to Rupee major units', () => {
      expect(paiseToRupees(10050)).toBe(100.5);
      expect(paiseToRupees(1)).toBe(0.01);
      expect(paiseToRupees(0)).toBe(0);
      expect(paiseToRupees(49999)).toBe(499.99);
      expect(paiseToRupees(12345678)).toBe(123456.78);
    });

    it('implements explicit Banker/Half-Up Rounding to closest minor unit', () => {
      expect(roundHalfUp(10.5)).toBe(11);
      expect(roundHalfUp(10.49)).toBe(10);
      expect(roundHalfUp(10.51)).toBe(11);
    });

    it('enforces safe integer bounds preventing overflow past MAX_SAFE_MONEY_PAISE', () => {
      expect(() => assertSafeMoneyMinor(-5, 'price')).toThrow(/cannot be negative/);
      expect(() => assertSafeMoneyMinor(10.5, 'price')).toThrow(/must be an integer/);
      expect(() => assertSafeMoneyMinor(MAX_SAFE_MONEY_PAISE + 1, 'price')).toThrow(/exceeds maximum safe integer/);
      expect(() => assertSafeMoneyMinor(MAX_SAFE_MONEY_PAISE, 'price')).not.toThrow();
    });
  });

  describe('Indian Currency Formatting (INR)', () => {
    it('formats paise correctly into INR currency representation', () => {
      const formatted = formatMoney(12345678);
      // Clean non-breaking spaces for platform-agnostic assertion
      const normalized = formatted.replace(/\u00a0/g, ' ');
      expect(normalized).toContain('1,23,456.78');
    });

    it('formats zero paise correctly', () => {
      const formatted = formatMoney(0);
      const normalized = formatted.replace(/\u00a0/g, ' ');
      expect(normalized).toContain('0.00');
    });
  });

  describe('Price Relationship Sanity Validation', () => {
    it('validates a compliant pricing structure', () => {
      const validPricing = {
        costPrice: 8000,
        sellingPrice: 12000,
        mrp: 15000,
        minimumSellingPrice: 10000,
        wholesalePrice: 11000,
      };

      const result = validatePriceRelationship(validPricing);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects selling price exceeding MRP', () => {
      const invalidPricing = {
        costPrice: 8000,
        sellingPrice: 16000, // Exceeds MRP of 15000
        mrp: 15000,
      };

      const result = validatePriceRelationship(invalidPricing);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed Maximum Retail Price');
    });

    it('rejects minimum selling price exceeding selling price', () => {
      const invalidPricing = {
        costPrice: 8000,
        sellingPrice: 12000,
        mrp: 15000,
        minimumSellingPrice: 13000, // Exceeds selling price
      };

      const result = validatePriceRelationship(invalidPricing);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed standard selling price');
    });

    it('rejects wholesale price exceeding MRP', () => {
      const invalidPricing = {
        costPrice: 8000,
        sellingPrice: 12000,
        mrp: 15000,
        wholesalePrice: 16000, // Exceeds MRP
      };

      const result = validatePriceRelationship(invalidPricing);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed MRP');
    });
  });
});
