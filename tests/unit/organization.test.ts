import { describe, it, expect } from 'vitest';
import {
  ProvisionOrganizationSchema,
  CreateStoreSchema,
  UpdateFiscalYearSchema,
  UpdateHeldBillSettingsSchema,
} from '../../functions/src/shared/schemas';

describe('Organization & Store Schemas Unit Tests', () => {
  const validOrgPayload = {
    organizationName: 'Metro Supermarket',
    legalName: 'Metro Supermarket Retail Private Limited',
    businessType: 'GROCERY' as const,
    email: 'admin@metrosupermarket.com',
    phone: '+91 9876543210',
    address: {
      street: '123 Market Road',
      city: 'Bangalore',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'India',
    },
    country: 'India',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    fiscalYearType: 'APRIL_TO_MARCH' as const,
    heldBillExpirationHours: 24,
    primaryStoreName: 'Metro Indiranagar',
    primaryStoreCode: 'BLR01',
  };

  it('should validate a correct organization provisioning payload', () => {
    const result = ProvisionOrganizationSchema.safeParse(validOrgPayload);
    expect(result.success).toBe(true);
  });

  it('should enforce default values for country, currency, and fiscal year', () => {
    const minimalPayload = {
      organizationName: 'Apex Hardware',
      legalName: 'Apex Hardware Supplies LLP',
      businessType: 'HARDWARE' as const,
      email: 'contact@apexhardware.com',
      phone: '9876543210',
      address: {
        street: '45 Industrial Area',
        city: 'Chennai',
        state: 'Tamil Nadu',
        postalCode: '600001',
      },
    };
    const parsed = ProvisionOrganizationSchema.parse(minimalPayload);
    expect(parsed.country).toBe('India');
    expect(parsed.currency).toBe('INR');
    expect(parsed.fiscalYearType).toBe('APRIL_TO_MARCH');
    expect(parsed.heldBillExpirationHours).toBe(24);
  });

  it('should reject held bill expiration hours exceeding the 72-hour system maximum', () => {
    const invalidPayload = {
      ...validOrgPayload,
      heldBillExpirationHours: 100, // max is 72
    };
    const result = ProvisionOrganizationSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should reject held bill expiration hours below the 1-hour system minimum', () => {
    const invalidPayload = {
      ...validOrgPayload,
      heldBillExpirationHours: 0, // min is 1
    };
    const result = ProvisionOrganizationSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should validate store creation payload with alphanumeric code', () => {
    const validStore = {
      organizationId: 'org_test123',
      storeCode: 'MUM02',
      name: 'Bandra West Branch',
      address: {
        street: 'Hill Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400050',
        country: 'India',
      },
      contactPhone: '9876500000',
    };
    const result = CreateStoreSchema.safeParse(validStore);
    expect(result.success).toBe(true);
  });

  it('should reject non-alphanumeric store codes', () => {
    const invalidStore = {
      organizationId: 'org_test123',
      storeCode: 'MUM@02!',
      name: 'Bandra West Branch',
      address: {
        street: 'Hill Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400050',
        country: 'India',
      },
      contactPhone: '9876500000',
    };
    const result = CreateStoreSchema.safeParse(invalidStore);
    expect(result.success).toBe(false);
  });

  it('should allow valid fiscal year update payload', () => {
    const update = {
      organizationId: 'org_123',
      fiscalYearType: 'JANUARY_TO_DECEMBER',
    };
    const result = UpdateFiscalYearSchema.safeParse(update);
    expect(result.success).toBe(true);
  });

  it('should reject invalid fiscal year type enum', () => {
    const update = {
      organizationId: 'org_123',
      fiscalYearType: 'JULY_TO_JUNE',
    };
    const result = UpdateFiscalYearSchema.safeParse(update);
    expect(result.success).toBe(false);
  });

  it('should validate held bill settings update within 1-72 range', () => {
    const update = {
      organizationId: 'org_123',
      expirationHours: 48,
    };
    const result = UpdateHeldBillSettingsSchema.safeParse(update);
    expect(result.success).toBe(true);
  });
});
