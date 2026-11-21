import { describe, it, expect } from 'vitest';
import {
  validateEan13CheckDigit,
  validateUpcaCheckDigit,
  validateCode128,
  validateCustomBarcode,
  detectAndValidateBarcode,
  normalizeSku,
  validateSku,
  canonicalizeAttributes,
  generateDeterministicVariantId,
  validateVariantAxes,
  generateCartesianCombinations,
  generateSkuFromTemplate,
} from '../../functions/src/shared/identifiers';

describe('Day 4: Identifier & Matrix Unit Test Suite', () => {
  // ==========================================================================
  // 1. EAN-13 Check Digit Tests
  // ==========================================================================
  describe('EAN-13 Check Digit Validation', () => {
    it('should validate standard valid EAN-13 barcodes', () => {
      // Standard genuine EAN-13 barcodes
      expect(validateEan13CheckDigit('8901030383458')).toBe(true);
      expect(validateEan13CheckDigit('4006381333931')).toBe(true);
      expect(validateEan13CheckDigit('73513537')).toBe(false); // EAN-8 is not EAN-13
      expect(validateEan13CheckDigit('9780201379624')).toBe(true);
    });

    it('should reject invalid EAN-13 checksums', () => {
      // Alter the check digit
      expect(validateEan13CheckDigit('8901030383457')).toBe(false);
      expect(validateEan13CheckDigit('4006381333932')).toBe(false);
    });

    it('should reject non-numeric and wrong-length inputs', () => {
      expect(validateEan13CheckDigit('890103038345')).toBe(false); // 12 digits
      expect(validateEan13CheckDigit('89010303834570')).toBe(false); // 14 digits
      expect(validateEan13CheckDigit('890103038345A')).toBe(false); // Non-digit
      expect(validateEan13CheckDigit('')).toBe(false);
    });
  });

  // ==========================================================================
  // 2. UPC-A Check Digit Tests
  // ==========================================================================
  describe('UPC-A Check Digit Validation', () => {
    it('should validate standard valid UPC-A barcodes', () => {
      expect(validateUpcaCheckDigit('012345678905')).toBe(true);
      expect(validateUpcaCheckDigit('036000291452')).toBe(true);
      expect(validateUpcaCheckDigit('617201019009')).toBe(true);
    });

    it('should reject invalid UPC-A checksums', () => {
      expect(validateUpcaCheckDigit('012345678904')).toBe(false);
      expect(validateUpcaCheckDigit('036000291459')).toBe(false);
    });

    it('should reject non-numeric and wrong-length inputs', () => {
      expect(validateUpcaCheckDigit('01234567890')).toBe(false); // 11 digits
      expect(validateUpcaCheckDigit('0123456789050')).toBe(false); // 13 digits
      expect(validateUpcaCheckDigit('01234567890X')).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Code-128 and Custom Identifier Validation
  // ==========================================================================
  describe('Code-128 & Custom Barcode Validation', () => {
    it('should validate printable ASCII for Code-128', () => {
      expect(validateCode128('PKG-BOX-9912')).toBe(true);
      expect(validateCode128('RS:STORE:ITEM:001')).toBe(true);
      expect(validateCode128('')).toBe(false);
    });

    it('should validate custom alphanumeric internal barcodes', () => {
      expect(validateCustomBarcode('INTERNAL_BAR_01')).toBe(true);
      expect(validateCustomBarcode('STYLE-992-BLK')).toBe(true);
      expect(validateCustomBarcode('A')).toBe(false); // Min 2 chars
      expect(validateCustomBarcode('INVALID@BARCODE')).toBe(false); // Special char '@' not allowed
    });

    it('detectAndValidateBarcode should correctly categorize formats', () => {
      const ean = detectAndValidateBarcode('8901030383458');
      expect(ean.valid).toBe(true);
      expect(ean.type).toBe('EAN13');

      const upc = detectAndValidateBarcode('012345678905');
      expect(upc.valid).toBe(true);
      expect(upc.type).toBe('UPCA');

      const custom = detectAndValidateBarcode('RS-SHIRT-M-BLUE');
      expect(custom.valid).toBe(true);
      expect(custom.type).toBe('CUSTOM');

      const invalid = detectAndValidateBarcode('8901030383457');
      expect(invalid.valid).toBe(false);
      expect(invalid.type).toBe('INVALID');
    });
  });

  // ==========================================================================
  // 4. SKU Normalization & Validation
  // ==========================================================================
  describe('SKU Validation & Formatting', () => {
    it('should normalize SKUs to trimmed uppercase', () => {
      expect(normalizeSku('  tshirt-blue-m  ')).toBe('TSHIRT-BLUE-M');
    });

    it('should validate compliant SKUs', () => {
      expect(validateSku('TSHIRT-01').valid).toBe(true);
      expect(validateSku('BOX_12/XL.RED').valid).toBe(true);
    });

    it('should reject invalid SKUs', () => {
      expect(validateSku('A').valid).toBe(false); // Less than 2 chars
      expect(validateSku('BAD SKU WITH SPACES').valid).toBe(false);
      expect(validateSku('TSHIRT#$!').valid).toBe(false);
    });
  });

  // ==========================================================================
  // 5. Deterministic Variant ID Generation
  // ==========================================================================
  describe('Deterministic Variant Identifier Engine', () => {
    it('should generate identical IDs regardless of attribute insertion order', () => {
      const combo1 = { Size: 'XL', Color: 'Navy Blue', Fit: 'Slim' };
      const combo2 = { Color: 'Navy Blue', Fit: 'Slim', Size: 'XL' };
      const combo3 = { fit: 'Slim', size: 'XL', color: 'Navy Blue' }; // casing in keys

      const id1 = generateDeterministicVariantId('prod_123', combo1);
      const id2 = generateDeterministicVariantId('prod_123', combo2);
      const id3 = generateDeterministicVariantId('prod_123', combo3);

      expect(id1).toBe(id2);
      expect(id1).toBe(id3);
      expect(id1).toMatch(/^var_[a-f0-9]{16}$/);
    });

    it('should generate distinct IDs for different attribute values', () => {
      const id1 = generateDeterministicVariantId('prod_123', { Size: 'M', Color: 'Red' });
      const id2 = generateDeterministicVariantId('prod_123', { Size: 'L', Color: 'Red' });
      expect(id1).not.toBe(id2);
    });

    it('should generate distinct IDs for different product parents', () => {
      const combo = { Size: 'M', Color: 'Red' };
      const id1 = generateDeterministicVariantId('prod_123', combo);
      const id2 = generateDeterministicVariantId('prod_456', combo);
      expect(id1).not.toBe(id2);
    });

    it('should preserve canonical attributes string representation', () => {
      const canonical = canonicalizeAttributes({ 'Style ': 'Slim ', ' Color': ' Blue' });
      expect(canonical).toBe('color=Blue;style=Slim');
    });
  });

  // ==========================================================================
  // 6. Cartesian Variant Matrix Generation & Axis Validation
  // ==========================================================================
  describe('Variant Matrix & Axes Configuration', () => {
    it('should support 1, 2, or 3 configured axes', () => {
      const oneAxis = [{ name: 'Size', values: ['S', 'M', 'L'] }];
      const val1 = validateVariantAxes(oneAxis);
      expect(val1.valid).toBe(true);
      const combos1 = generateCartesianCombinations(val1.validatedAxes);
      expect(combos1.length).toBe(3);

      const twoAxes = [
        { name: 'Size', values: ['S', 'M'] },
        { name: 'Color', values: ['Red', 'Blue', 'Green'] },
      ];
      const val2 = validateVariantAxes(twoAxes);
      expect(val2.valid).toBe(true);
      const combos2 = generateCartesianCombinations(val2.validatedAxes);
      expect(combos2.length).toBe(6); // 2 * 3

      const threeAxes = [
        { name: 'Size', values: ['S', 'M'] },
        { name: 'Color', values: ['Red', 'Blue'] },
        { name: 'Fit', values: ['Regular', 'Slim'] },
      ];
      const val3 = validateVariantAxes(threeAxes);
      expect(val3.valid).toBe(true);
      const combos3 = generateCartesianCombinations(val3.validatedAxes);
      expect(combos3.length).toBe(8); // 2 * 2 * 2
    });

    it('should reject more than 3 axes', () => {
      const fourAxes = [
        { name: 'A', values: ['1'] },
        { name: 'B', values: ['1'] },
        { name: 'C', values: ['1'] },
        { name: 'D', values: ['1'] },
      ];
      const res = validateVariantAxes(fourAxes);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('maximum of 3');
    });

    it('should reject duplicate axis names (case-insensitive)', () => {
      const dupAxes = [
        { name: 'Size', values: ['S'] },
        { name: 'size', values: ['M'] },
      ];
      const res = validateVariantAxes(dupAxes);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Duplicate axis');
    });

    it('should reject duplicate values within an axis', () => {
      const dupValues = [
        { name: 'Size', values: ['S', 'M', 's'] },
      ];
      const res = validateVariantAxes(dupValues);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Duplicate value');
    });
  });

  // ==========================================================================
  // 7. SKU Template Evaluation
  // ==========================================================================
  describe('SKU Template Evaluation', () => {
    it('should generate SKUs using {PRODUCT_CODE} and attribute placeholders', () => {
      const sku = generateSkuFromTemplate('{PRODUCT_CODE}-{SIZE}-{COLOR}', {
        productCode: 'SHIRT',
        attributes: { Size: 'XL', Color: 'Navy Blue' },
      });
      expect(sku).toBe('SHIRT-XL-NAVYBLUE');
    });

    it('should support indexed padding: {INDEX_PAD}', () => {
      const sku = generateSkuFromTemplate('{CODE}-{INDEX_PAD}', {
        productCode: 'TEA',
        attributes: { Weight: '500g' },
        index: 7,
      });
      expect(sku).toBe('TEA-007');
    });
  });
});
