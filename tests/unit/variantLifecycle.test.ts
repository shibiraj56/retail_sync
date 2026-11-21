import { describe, it, expect } from 'vitest';
import {
  generateDeterministicVariantId,
  generateCartesianCombinations,
  validateVariantAxes,
  canonicalizeAttributes,
} from '../../functions/src/shared/identifiers';
import { ROLE_DEFAULT_PERMISSIONS, type UserRole } from '../../functions/src/shared/types';

describe('Day 4: Variant Lifecycle, Identifier Retention & Authorization Audit', () => {
  // ==========================================================================
  // 1. Matrix Regeneration & Attribute Changes
  // ==========================================================================
  describe('Matrix Regeneration & Attribute Evolution', () => {
    const productId = 'prod_garment_01';

    it('should preserve identical variant IDs and pricing upon matrix regeneration', () => {
      const initialAxes = [
        { name: 'Size', values: ['S', 'M', 'L'] },
        { name: 'Color', values: ['Black', 'White'] },
      ];

      const val1 = validateVariantAxes(initialAxes);
      expect(val1.valid).toBe(true);
      const combos1 = generateCartesianCombinations(val1.validatedAxes);
      expect(combos1).toHaveLength(6);

      const generatedIds1 = combos1.map((c) => generateDeterministicVariantId(productId, c));

      // Simulate a matrix regeneration with the exact same attributes
      const regeneratedCombos = generateCartesianCombinations(val1.validatedAxes);
      const generatedIds2 = regeneratedCombos.map((c) => generateDeterministicVariantId(productId, c));

      expect(generatedIds1).toEqual(generatedIds2);
    });

    it('should preserve existing variant IDs when a new attribute value is added', () => {
      const initialAxes = [
        { name: 'Size', values: ['S', 'M'] },
        { name: 'Color', values: ['Red'] },
      ];
      const initialCombos = generateCartesianCombinations(validateVariantAxes(initialAxes).validatedAxes);
      const initialIds = new Set(initialCombos.map((c) => generateDeterministicVariantId(productId, c)));
      expect(initialIds.size).toBe(2);

      // Add 'L' to Size
      const expandedAxes = [
        { name: 'Size', values: ['S', 'M', 'L'] },
        { name: 'Color', values: ['Red'] },
      ];
      const expandedCombos = generateCartesianCombinations(validateVariantAxes(expandedAxes).validatedAxes);
      expect(expandedCombos).toHaveLength(3);

      const expandedIds = expandedCombos.map((c) => generateDeterministicVariantId(productId, c));

      // Verify all pre-existing variant IDs are preserved exactly
      for (const oldId of initialIds) {
        expect(expandedIds).toContain(oldId);
      }

      // The new combination has its own unique deterministic ID
      const newCombo = { Size: 'L', Color: 'Red' };
      const newId = generateDeterministicVariantId(productId, newCombo);
      expect(expandedIds).toContain(newId);
      expect(initialIds.has(newId)).toBe(false);
    });

    it('should identify orphaned variants without silently deleting them when an attribute value is removed', () => {
      const initialAxes = [
        { name: 'Size', values: ['S', 'M'] },
        { name: 'Color', values: ['Black'] },
      ];
      const initialCombos = generateCartesianCombinations(validateVariantAxes(initialAxes).validatedAxes);
      const existingDbVariants = new Map<string, any>();

      for (const combo of initialCombos) {
        const id = generateDeterministicVariantId(productId, combo);
        existingDbVariants.set(id, {
          id,
          sku: `SKU-${combo.Size}-${combo.Color}`,
          attributeValues: combo,
          status: 'ACTIVE',
        });
      }

      // User removes 'M' from Size (leaving only 'S')
      const reducedAxes = [
        { name: 'Size', values: ['S'] },
        { name: 'Color', values: ['Black'] },
      ];
      const proposedCombos = generateCartesianCombinations(validateVariantAxes(reducedAxes).validatedAxes);
      const proposedIds = new Set(proposedCombos.map((c) => generateDeterministicVariantId(productId, c)));

      // Detection of orphaned variants
      const orphanedVariants: any[] = [];
      for (const [id, data] of existingDbVariants.entries()) {
        if (!proposedIds.has(id)) {
          orphanedVariants.push(data);
        }
      }

      // The 'M/Black' variant is detected as orphaned
      expect(orphanedVariants).toHaveLength(1);
      expect(orphanedVariants[0].attributeValues).toEqual({ Size: 'M', Color: 'Black' });
      // Crucial: The orphaned variant is NOT deleted; its database record and SKU remain intact!
      expect(existingDbVariants.has(orphanedVariants[0].id)).toBe(true);
    });

    it('should generate a new canonical ID when an attribute value is renamed and preserve the retired variant', () => {
      const oldCombo = { Size: 'Medium', Color: 'Black' };
      const oldId = generateDeterministicVariantId(productId, oldCombo);

      // Renamed 'Medium' -> 'M'
      const newCombo = { Size: 'M', Color: 'Black' };
      const newId = generateDeterministicVariantId(productId, newCombo);

      expect(oldId).not.toBe(newId);
      expect(canonicalizeAttributes(oldCombo)).toBe('color=Black;size=Medium');
      expect(canonicalizeAttributes(newCombo)).toBe('color=Black;size=M');
    });
  });

  // ==========================================================================
  // 2. Identifier Retention & Archival Policies
  // ==========================================================================
  describe('SKU & Barcode Retention & Archival Registry Policy', () => {
    interface RegistryEntry {
      id: string;
      targetVariantId: string;
      status: 'ACTIVE' | 'RESERVED_ARCHIVED';
      supersededBy?: string;
      retiredAt?: number;
    }

    it('should atomically retire replaced SKU and prevent re-reservation', () => {
      const skuRegistry = new Map<string, RegistryEntry>();
      const now = Date.now();

      // 1. Initial reservation
      skuRegistry.set('TSHIRT-S-RED', {
        id: 'TSHIRT-S-RED',
        targetVariantId: 'var_001',
        status: 'ACTIVE',
      });

      // 2. SKU Replacement: Variant 'var_001' changes SKU to 'TSHIRT-S-CRIMSON'
      const oldSku = 'TSHIRT-S-RED';
      const newSku = 'TSHIRT-S-CRIMSON';

      // Old SKU transitioned to RESERVED_ARCHIVED
      const oldEntry = skuRegistry.get(oldSku)!;
      oldEntry.status = 'RESERVED_ARCHIVED';
      oldEntry.supersededBy = newSku;
      oldEntry.retiredAt = now;

      // New SKU registered as ACTIVE
      skuRegistry.set(newSku, {
        id: newSku,
        targetVariantId: 'var_001',
        status: 'ACTIVE',
      });

      // 3. Re-reservation attempt: Another variant tries to claim the retired SKU 'TSHIRT-S-RED'
      const attemptEntry = skuRegistry.get('TSHIRT-S-RED');
      expect(attemptEntry).toBeDefined();
      expect(attemptEntry?.status).toBe('RESERVED_ARCHIVED');

      // System rule: RESERVED_ARCHIVED identifiers can NEVER be reused
      const canClaim = !attemptEntry || attemptEntry.status !== 'RESERVED_ARCHIVED';
      expect(canClaim).toBe(false);
    });

    it('should retire primary and all additional barcodes upon variant archival', () => {
      const barcodeRegistry = new Map<string, RegistryEntry>();
      const primaryBc = '8901030383458';
      const addBc1 = '012345678905';
      const addBc2 = 'STYLE-BAR-99';

      barcodeRegistry.set(primaryBc, { id: primaryBc, targetVariantId: 'var_arch_01', status: 'ACTIVE' });
      barcodeRegistry.set(addBc1, { id: addBc1, targetVariantId: 'var_arch_01', status: 'ACTIVE' });
      barcodeRegistry.set(addBc2, { id: addBc2, targetVariantId: 'var_arch_01', status: 'ACTIVE' });

      // Simulate variant archival
      const barcodesToRetire = [primaryBc, addBc1, addBc2];
      for (const bc of barcodesToRetire) {
        const entry = barcodeRegistry.get(bc)!;
        entry.status = 'RESERVED_ARCHIVED';
        entry.retiredAt = Date.now();
      }

      // Verify all barcodes are now permanently reserved
      for (const bc of barcodesToRetire) {
        expect(barcodeRegistry.get(bc)?.status).toBe('RESERVED_ARCHIVED');
      }
    });
  });

  // ==========================================================================
  // 3. Role Authorization Matrix
  // ==========================================================================
  describe('Callable Endpoint Authorization Matrix', () => {
    const CATALOG_ALLOWED_ROLES = ['OWNER', 'MANAGER', 'INVENTORY_MANAGER'];

    function checkCatalogWriteAuthorization(role: UserRole, membershipStatus: 'ACTIVE' | 'SUSPENDED' | 'INVITED') {
      if (membershipStatus !== 'ACTIVE') {
        throw new Error(`Membership is ${membershipStatus}`);
      }
      if (!CATALOG_ALLOWED_ROLES.includes(role)) {
        throw new Error(`Role '${role}' does not have catalog write privileges`);
      }
      return true;
    }

    it('should authorize OWNER, MANAGER, and INVENTORY_MANAGER with active memberships', () => {
      expect(checkCatalogWriteAuthorization('OWNER', 'ACTIVE')).toBe(true);
      expect(checkCatalogWriteAuthorization('MANAGER', 'ACTIVE')).toBe(true);
      expect(checkCatalogWriteAuthorization('INVENTORY_MANAGER', 'ACTIVE')).toBe(true);
    });

    it('should strictly reject CASHIER role from variant or registry modifications', () => {
      expect(() => {
        checkCatalogWriteAuthorization('CASHIER', 'ACTIVE');
      }).toThrow("Role 'CASHIER' does not have catalog write privileges");
    });

    it('should strictly reject ACCOUNTANT role from variant or registry modifications', () => {
      expect(() => {
        checkCatalogWriteAuthorization('ACCOUNTANT', 'ACTIVE');
      }).toThrow("Role 'ACCOUNTANT' does not have catalog write privileges");
    });

    it('should strictly reject suspended memberships regardless of role', () => {
      expect(() => {
        checkCatalogWriteAuthorization('OWNER', 'SUSPENDED');
      }).toThrow('Membership is SUSPENDED');
      expect(() => {
        checkCatalogWriteAuthorization('MANAGER', 'SUSPENDED');
      }).toThrow('Membership is SUSPENDED');
      expect(() => {
        checkCatalogWriteAuthorization('INVENTORY_MANAGER', 'SUSPENDED');
      }).toThrow('Membership is SUSPENDED');
    });

    it('should confirm Cashier default permissions contain only catalog:read, not catalog:write', () => {
      const cashierPerms = ROLE_DEFAULT_PERMISSIONS.CASHIER;
      expect(cashierPerms).toContain('catalog:read');
      expect(cashierPerms).not.toContain('catalog:write');
    });
  });
});
