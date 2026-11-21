import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

describe('Firestore Security Rules Comprehensive Security Audit Test Suite', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const rulesPath = path.resolve(__dirname, '../../firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    testEnv = await initializeTestEnvironment({
      projectId: 'demo-retail-sync',
      firestore: {
        rules,
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  // --- 1. User Profile Protection & Privilege Escalation ---
  it('SEC-TC-PROFILE: should allow users to create and update their permitted profile fields', async () => {
    const aliceContext = testEnv.authenticatedContext('alice_123', {
      email: 'alice@retail.com',
    });
    const db = aliceContext.firestore();

    const userDocRef = db.collection('users').doc('alice_123');
    await assertSucceeds(
      userDocRef.set({
        id: 'alice_123',
        email: 'alice@retail.com',
        displayName: 'Alice Retailer',
        isActive: true,
      })
    );

    // Update only permitted field (displayName)
    await assertSucceeds(
      userDocRef.update({
        displayName: 'Alice Manager',
      })
    );
  });

  it('SEC-TC-08-ESCALATION: should strictly reject attempts to escalate privileges or modify sensitive fields on /users/{userId}', async () => {
    const aliceContext = testEnv.authenticatedContext('alice_123', {
      email: 'alice@retail.com',
    });
    const db = aliceContext.firestore();

    // Setup base user profile
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('users').doc('alice_123').set({
        id: 'alice_123',
        email: 'alice@retail.com',
        displayName: 'Alice Retailer',
        isActive: true,
        defaultOrganizationId: 'org_legit',
      });
    });

    const userDocRef = db.collection('users').doc('alice_123');

    // Attempt 1: Inject 'role: OWNER'
    await assertFails(
      userDocRef.update({
        role: 'OWNER',
      })
    );

    // Attempt 2: Inject 'isAdmin: true'
    await assertFails(
      userDocRef.update({
        isAdmin: true,
      })
    );

    // Attempt 3: Modify account status 'isActive: false'
    await assertFails(
      userDocRef.update({
        isActive: false,
      })
    );

    // Attempt 4: Tamper with organization assignment
    await assertFails(
      userDocRef.update({
        defaultOrganizationId: 'org_victim',
      })
    );
  });

  // --- 2. Membership Collection Lockdown ---
  it('SEC-TC-09-MEMBERSHIP: should strictly forbid direct client writes to userMemberships collection', async () => {
    const aliceContext = testEnv.authenticatedContext('alice_123', {
      email: 'alice@retail.com',
    });
    const db = aliceContext.firestore();

    const membershipRef = db.collection('userMemberships').doc('alice_123_org_apex');
    await assertFails(
      membershipRef.set({
        userId: 'alice_123',
        organizationId: 'org_apex',
        role: 'OWNER',
        status: 'ACTIVE',
      })
    );
  });

  // --- 3. Multi-Tenant Cross-Tenant Boundary Tests ---
  it('SEC-TC-01: should reject cross-tenant reads (Org A user reading Org B documents)', async () => {
    // Setup Org B store and membership
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.collection('userMemberships').doc('bob_org_bravo').set({
        userId: 'bob_456',
        organizationId: 'org_bravo',
        role: 'OWNER',
        status: 'ACTIVE',
      });
      await adminDb
        .collection('organizations')
        .doc('org_bravo')
        .collection('stores')
        .doc('store_bravo_01')
        .set({
          name: 'Bravo Store',
          organizationId: 'org_bravo',
        });
    });

    // Alice belongs only to Org Alpha
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('alice_123_org_alpha').set({
        userId: 'alice_123',
        organizationId: 'org_alpha',
        role: 'OWNER',
        status: 'ACTIVE',
      });
    });

    const aliceContext = testEnv.authenticatedContext('alice_123');
    const db = aliceContext.firestore();

    const storeRef = db
      .collection('organizations')
      .doc('org_bravo')
      .collection('stores')
      .doc('store_bravo_01');

    await assertFails(storeRef.get());
  });

  it('SEC-TC-02: should reject cross-tenant writes (Org A user writing to Org B master catalog)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('alice_123_org_alpha').set({
        userId: 'alice_123',
        organizationId: 'org_alpha',
        role: 'OWNER',
        status: 'ACTIVE',
      });
    });

    const aliceContext = testEnv.authenticatedContext('alice_123');
    const db = aliceContext.firestore();

    const foreignProductRef = db
      .collection('organizations')
      .doc('org_bravo')
      .collection('products')
      .doc('prod_99');

    await assertFails(
      foreignProductRef.set({
        name: 'Hacked Product',
        organizationId: 'org_bravo',
      })
    );
  });

  // --- 4. Cross-Store & Scoping Enforcement ---
  it('SEC-TC-03: should enforce store branch scoping (Cashier cannot touch unassigned store)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      // Cashier assigned only to store_01
      await adminDb.collection('userMemberships').doc('cashier_1_org_alpha').set({
        userId: 'cashier_1',
        organizationId: 'org_alpha',
        role: 'CASHIER',
        assignedStoreIds: ['store_01'],
        status: 'ACTIVE',
      });
    });

    const cashierContext = testEnv.authenticatedContext('cashier_1');
    const db = cashierContext.firestore();

    // Permitted to manage held bills in assigned store_01
    const allowedHeldBillRef = db
      .collection('organizations')
      .doc('org_alpha')
      .collection('stores')
      .doc('store_01')
      .collection('heldBills')
      .doc('bill_01');

    await assertSucceeds(
      allowedHeldBillRef.set({
        cashierUserId: 'cashier_1',
        heldAt: new Date(),
      })
    );

    // Forbidden to touch held bills in unassigned store_02
    const forbiddenHeldBillRef = db
      .collection('organizations')
      .doc('org_alpha')
      .collection('stores')
      .doc('store_02')
      .collection('heldBills')
      .doc('bill_02');

    await assertFails(
      forbiddenHeldBillRef.set({
        cashierUserId: 'cashier_1',
        heldAt: new Date(),
      })
    );
  });

  // --- 5. Suspended Membership Rejection ---
  it('SEC-TC-04: should reject access when a user membership is SUSPENDED', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.collection('userMemberships').doc('charlie_org_alpha').set({
        userId: 'charlie_99',
        organizationId: 'org_alpha',
        role: 'MANAGER',
        status: 'SUSPENDED', // Suspended member
      });
      await adminDb
        .collection('organizations')
        .doc('org_alpha')
        .collection('stores')
        .doc('store_01')
        .set({
          name: 'Alpha Main',
          organizationId: 'org_alpha',
        });
    });

    const charlieContext = testEnv.authenticatedContext('charlie_99');
    const db = charlieContext.firestore();

    const storeRef = db
      .collection('organizations')
      .doc('org_alpha')
      .collection('stores')
      .doc('store_01');

    // Access must fail because status is SUSPENDED
    await assertFails(storeRef.get());
  });

  // --- 6. Direct Client Write Lockdowns on Financial & Inventory Paths ---
  it('SEC-TC-05: should strictly forbid direct client writes to store inventory balances', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('alice_org_alpha').set({
        userId: 'alice_123',
        organizationId: 'org_alpha',
        role: 'OWNER',
        status: 'ACTIVE',
      });
    });

    const ownerContext = testEnv.authenticatedContext('alice_123');
    const db = ownerContext.firestore();

    const inventoryRef = db
      .collection('organizations')
      .doc('org_alpha')
      .collection('stores')
      .doc('store_01')
      .collection('inventory')
      .doc('var_101');

    await assertFails(
      inventoryRef.set({
        onHandQuantity: 99999,
        availableQuantity: 99999,
      })
    );
  });

  it('SEC-TC-06: should strictly forbid direct client writes to sales ledger', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('cashier_org_alpha').set({
        userId: 'cashier_1',
        organizationId: 'org_alpha',
        role: 'CASHIER',
        assignedStoreIds: ['store_01'],
        status: 'ACTIVE',
      });
    });

    const cashierContext = testEnv.authenticatedContext('cashier_1');
    const db = cashierContext.firestore();

    const saleRef = db
      .collection('organizations')
      .doc('org_alpha')
      .collection('stores')
      .doc('store_01')
      .collection('sales')
      .doc('sale_fake_123');

    await assertFails(
      saleRef.set({
        invoiceNumber: 'FAKE/001',
        finalNetTotal: 0,
      })
    );
  });

  it('SEC-TC-07: should strictly forbid direct client writes to stock movements audit ledger', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('owner_org_alpha').set({
        userId: 'owner_1',
        organizationId: 'org_alpha',
        role: 'OWNER',
        status: 'ACTIVE',
      });
    });

    const ownerContext = testEnv.authenticatedContext('owner_1');
    const db = ownerContext.firestore();

    const movementRef = db
      .collection('organizations')
      .doc('org_alpha')
      .collection('stockMovements')
      .doc('movement_fake');

    await assertFails(
      movementRef.set({
        quantityDelta: 100,
        movementType: 'SALE',
      })
    );
  });

  it('SEC-TC-COUNTERS: should strictly forbid direct client writes to sequential invoice counters', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('cashier_org_alpha').set({
        userId: 'cashier_1',
        organizationId: 'org_alpha',
        role: 'CASHIER',
        status: 'ACTIVE',
      });
    });

    const cashierContext = testEnv.authenticatedContext('cashier_1');
    const db = cashierContext.firestore();

    const counterRef = db
      .collection('organizations')
      .doc('org_alpha')
      .collection('stores')
      .doc('store_01')
      .collection('counters')
      .doc('invoices_2026-2027');

    await assertFails(
      counterRef.set({
        currentSequenceNumber: 9999,
      })
    );
  });

  // --- 8. Phase 2 Master Data & Customer Safeguards ---
  it('SEC-TC-CATALOG-WRITE: should strictly forbid direct client writes to categories, brands, UoMs and registries', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('owner_org_alpha').set({
        userId: 'owner_1',
        organizationId: 'org_alpha',
        role: 'OWNER',
        status: 'ACTIVE',
      });
    });

    const ownerContext = testEnv.authenticatedContext('owner_1');
    const db = ownerContext.firestore();

    // Direct write to categories
    await assertFails(
      db.collection('organizations').doc('org_alpha').collection('categories').doc('cat_1').set({
        name: 'Direct Category',
      })
    );

    // Direct write to brands
    await assertFails(
      db.collection('organizations').doc('org_alpha').collection('brands').doc('brand_1').set({
        name: 'Direct Brand',
      })
    );

    // Direct write to unitsOfMeasure
    await assertFails(
      db.collection('organizations').doc('org_alpha').collection('unitsOfMeasure').doc('uom_1').set({
        name: 'Direct UoM',
      })
    );

    // Direct write to codeRegistry
    await assertFails(
      db.collection('organizations').doc('org_alpha').collection('codeRegistry').doc('CATEGORY_CODE').set({
        targetDocumentId: 'cat_1',
      })
    );
  });

  it('SEC-TC-CUSTOMER-CASHIER: should allow Cashier to create and update B2C customer contact, but reject B2B or status tampering', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.collection('userMemberships').doc('cashier_cust_1_org_alpha').set({
        userId: 'cashier_cust_1',
        organizationId: 'org_alpha',
        role: 'CASHIER',
        status: 'ACTIVE',
      });
      // Seed an existing customer
      await adminDb.collection('organizations').doc('org_alpha').collection('customers').doc('cust_existing').set({
        id: 'cust_existing',
        organizationId: 'org_alpha',
        name: 'John Doe',
        phone: '+919876543210',
        type: 'B2C_RETAIL',
        status: 'ACTIVE',
        createdAt: '2026-11-21T00:00:00Z',
        updatedAt: '2026-11-21T00:00:00Z',
      });
    });

    const cashierContext = testEnv.authenticatedContext('cashier_cust_1');
    const db = cashierContext.firestore();

    // 1. Cashier CAN create valid B2C customer with exact allowlist
    const validCustomerRef = db.collection('organizations').doc('org_alpha').collection('customers').doc('cust_new_b2c');
    await assertSucceeds(
      validCustomerRef.set({
        id: 'cust_new_b2c',
        organizationId: 'org_alpha',
        name: 'Jane Retail',
        phone: '+919876543211',
        type: 'B2C_RETAIL',
        status: 'ACTIVE',
        createdAt: '2026-11-21T00:00:00Z',
        updatedAt: '2026-11-21T00:00:00Z',
      })
    );

    // 2. Cashier CANNOT create B2B customer
    const b2bCustomerRef = db.collection('organizations').doc('org_alpha').collection('customers').doc('cust_new_b2b');
    await assertFails(
      b2bCustomerRef.set({
        id: 'cust_new_b2b',
        organizationId: 'org_alpha',
        name: 'Acme Corp',
        phone: '+919876543212',
        type: 'B2B_WHOLESALE',
        status: 'ACTIVE',
        createdAt: '2026-11-21T00:00:00Z',
        updatedAt: '2026-11-21T00:00:00Z',
      })
    );

    // 3. Cashier CANNOT inject creditLimit or b2bData during creation
    const privilegedCustomerRef = db.collection('organizations').doc('org_alpha').collection('customers').doc('cust_hack');
    await assertFails(
      privilegedCustomerRef.set({
        id: 'cust_hack',
        organizationId: 'org_alpha',
        name: 'Hacker',
        phone: '+919876543213',
        type: 'B2C_RETAIL',
        status: 'ACTIVE',
        creditLimit: 50000,
        createdAt: '2026-11-21T00:00:00Z',
        updatedAt: '2026-11-21T00:00:00Z',
      })
    );

    // 4. Cashier CAN update allowed contact fields on existing customer
    const existingRef = db.collection('organizations').doc('org_alpha').collection('customers').doc('cust_existing');
    await assertSucceeds(
      existingRef.update({
        phone: '+919876543999',
        email: 'john.doe@gmail.com',
        updatedAt: '2026-11-21T10:00:00Z',
      })
    );

    // 5. Cashier CANNOT change customer status to BLOCKED or tamper with type
    await assertFails(
      existingRef.update({
        status: 'BLOCKED',
      })
    );

    // 6. Direct delete is forbidden
    await assertFails(existingRef.delete());
  });

  it('SEC-TC-CUSTOMER-INVENTORY-MGR: should forbid Inventory Manager from creating or updating customers', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('inv_org_alpha').set({
        userId: 'inv_1',
        organizationId: 'org_alpha',
        role: 'INVENTORY_MANAGER',
        status: 'ACTIVE',
      });
    });

    const invContext = testEnv.authenticatedContext('inv_1');
    const db = invContext.firestore();

    const customerRef = db.collection('organizations').doc('org_alpha').collection('customers').doc('cust_inv_test');
    await assertFails(
      customerRef.set({
        id: 'cust_inv_test',
        organizationId: 'org_alpha',
        name: 'Should Fail',
        phone: '+919876543222',
        type: 'B2C_RETAIL',
        status: 'ACTIVE',
      })
    );
  });

  // --- 8. Product Master Client Write & Read Protection ---
  it('SEC-TC-PRODUCT-CLIENT-WRITE-FORBIDDEN: should strictly forbid direct client writes to products or variants', async () => {
    // Setup active owner membership
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('prod_owner_org_alpha').set({
        userId: 'prod_owner_1',
        organizationId: 'org_alpha',
        role: 'OWNER',
        status: 'ACTIVE',
      });
    });

    const ownerContext = testEnv.authenticatedContext('prod_owner_1');
    const db = ownerContext.firestore();

    const productRef = db
      .collection('organizations')
      .doc('org_alpha')
      .collection('products')
      .doc('prod_direct_client_attempt');

    // Direct client create attempt MUST fail
    await assertFails(
      productRef.set({
        id: 'prod_direct_client_attempt',
        organizationId: 'org_alpha',
        name: 'Bypassing Cloud Function',
        code: 'HACK-01',
        categoryId: 'cat_1',
        baseUomId: 'uom_pcs',
        status: 'ACTIVE',
      })
    );

    // Direct client variant create attempt MUST fail
    const variantRef = productRef.collection('variants').doc('var_direct');
    await assertFails(
      variantRef.set({
        id: 'var_direct',
        sku: 'HACK-01-RED',
      })
    );
  });

  // --- 9. Day 4: Variant Registries & Background Jobs Security ---
  it('SEC-TC-REGISTRY-CLIENT-WRITE-FORBIDDEN: should strictly forbid direct client writes to skuRegistry, barcodeRegistry, and variantJobs', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('reg_owner_org_alpha').set({
        userId: 'reg_owner_1',
        organizationId: 'org_alpha',
        role: 'OWNER',
        status: 'ACTIVE',
      });
    });

    const ownerContext = testEnv.authenticatedContext('reg_owner_1');
    const db = ownerContext.firestore();

    // 1. Direct write to skuRegistry MUST fail
    const skuRef = db.collection('organizations').doc('org_alpha').collection('skuRegistry').doc('SKU-MALICIOUS');
    await assertFails(
      skuRef.set({
        id: 'SKU-MALICIOUS',
        sku: 'SKU-MALICIOUS',
        status: 'ACTIVE',
      })
    );

    // 2. Direct write to barcodeRegistry MUST fail
    const bcRef = db.collection('organizations').doc('org_alpha').collection('barcodeRegistry').doc('8901030383457');
    await assertFails(
      bcRef.set({
        id: '8901030383457',
        barcode: '8901030383457',
        status: 'ACTIVE',
      })
    );

    // 3. Direct write to variantJobs MUST fail
    const jobRef = db.collection('organizations').doc('org_alpha').collection('variantJobs').doc('job_hacked');
    await assertFails(
      jobRef.set({
        id: 'job_hacked',
        status: 'COMPLETED',
      })
    );
  });

  it('SEC-TC-REGISTRY-TENANT-ISOLATION: should enforce cross-tenant and suspended member isolation for variants and registries', async () => {
    // Seed test data with rules disabled
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      // Seed active membership for Alpha
      await adminDb.collection('userMemberships').doc('alpha_member_org_alpha').set({
        userId: 'alpha_member',
        organizationId: 'org_alpha',
        role: 'MANAGER',
        status: 'ACTIVE',
      });

      // Seed active membership for Beta
      await adminDb.collection('userMemberships').doc('beta_member_org_beta').set({
        userId: 'beta_member',
        organizationId: 'org_beta',
        role: 'OWNER',
        status: 'ACTIVE',
      });

      // Seed suspended membership in Alpha
      await adminDb.collection('userMemberships').doc('suspended_alpha_org_alpha').set({
        userId: 'suspended_alpha',
        organizationId: 'org_alpha',
        role: 'MANAGER',
        status: 'SUSPENDED',
      });

      // Seed variant document
      await adminDb
        .collection('organizations')
        .doc('org_alpha')
        .collection('products')
        .doc('prod_100')
        .collection('variants')
        .doc('var_100_s')
        .set({
          id: 'var_100_s',
          sku: 'SHIRT-S',
          barcode: '8901030383457',
          status: 'ACTIVE',
        });

      // Seed SKU registry entry
      await adminDb
        .collection('organizations')
        .doc('org_alpha')
        .collection('skuRegistry')
        .doc('SHIRT-S')
        .set({
          id: 'SHIRT-S',
          status: 'ACTIVE',
        });

      // Seed Barcode registry entry
      await adminDb
        .collection('organizations')
        .doc('org_alpha')
        .collection('barcodeRegistry')
        .doc('8901030383457')
        .set({
          id: '8901030383457',
          status: 'ACTIVE',
        });
    });

    const alphaContext = testEnv.authenticatedContext('alpha_member');
    const betaContext = testEnv.authenticatedContext('beta_member');
    const suspendedContext = testEnv.authenticatedContext('suspended_alpha');

    const alphaVariantRef = alphaContext.firestore()
      .collection('organizations')
      .doc('org_alpha')
      .collection('products')
      .doc('prod_100')
      .collection('variants')
      .doc('var_100_s');

    const alphaSkuRef = alphaContext.firestore()
      .collection('organizations')
      .doc('org_alpha')
      .collection('skuRegistry')
      .doc('SHIRT-S');

    // 1. Active Alpha member CAN read variants and registry in Org Alpha
    await assertSucceeds(alphaVariantRef.get());
    await assertSucceeds(alphaSkuRef.get());

    // 2. Beta member CANNOT read variants or registry in Org Alpha (cross-tenant rejected)
    const betaAttemptVariant = betaContext.firestore()
      .collection('organizations')
      .doc('org_alpha')
      .collection('products')
      .doc('prod_100')
      .collection('variants')
      .doc('var_100_s');

    const betaAttemptSku = betaContext.firestore()
      .collection('organizations')
      .doc('org_alpha')
      .collection('skuRegistry')
      .doc('SHIRT-S');

    await assertFails(betaAttemptVariant.get());
    await assertFails(betaAttemptSku.get());

    // 3. Suspended member CANNOT read variants or registry in Org Alpha
    const suspendedAttemptVariant = suspendedContext.firestore()
      .collection('organizations')
      .doc('org_alpha')
      .collection('products')
      .doc('prod_100')
      .collection('variants')
      .doc('var_100_s');

    await assertFails(suspendedAttemptVariant.get());
  });

  // --- 11. Day 5: Tax Configurations, Pricing Rules, & Pricing History Security ---
  it('SEC-TC-PRICING-01: Direct client writes to taxConfigurations, pricingRules, and pricingHistory must be strictly denied', async () => {
    // Setup org and active owner
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.collection('organizations').doc('org_pricing').set({
        name: 'Pricing Org',
        status: 'ACTIVE',
      });
      await adminDb
        .collection('userMemberships')
        .doc('owner_user_org_pricing')
        .set({
          userId: 'owner_user',
          organizationId: 'org_pricing',
          role: 'OWNER',
          status: 'ACTIVE',
        });
    });

    const ownerContext = testEnv.authenticatedContext('owner_user');
    const db = ownerContext.firestore();

    const taxRef = db
      .collection('organizations')
      .doc('org_pricing')
      .collection('taxConfigurations')
      .doc('tax_gst_18');

    const ruleRef = db
      .collection('organizations')
      .doc('org_pricing')
      .collection('pricingRules')
      .doc('rule_store_1');

    const historyRef = db
      .collection('organizations')
      .doc('org_pricing')
      .collection('pricingHistory')
      .doc('hist_1');

    // Attempt direct writes from client - all must fail even for OWNER
    await assertFails(
      taxRef.set({
        name: 'GST 18%',
        ratePercent: 18,
        status: 'ACTIVE',
      })
    );

    await assertFails(
      ruleRef.set({
        level: 'STORE',
        priceMinor: 9900,
        status: 'ACTIVE',
      })
    );

    await assertFails(
      historyRef.set({
        oldPriceMinor: 10000,
        newPriceMinor: 9900,
      })
    );
  });

  it('SEC-TC-PRICING-02: Active organization members can read pricing and tax collections, while cross-tenant and suspended members are blocked', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.collection('organizations').doc('org_pricing_a').set({
        name: 'Pricing Org A',
        status: 'ACTIVE',
      });
      await adminDb.collection('organizations').doc('org_pricing_b').set({
        name: 'Pricing Org B',
        status: 'ACTIVE',
      });

      // Active Cashier in Org A
      await adminDb
        .collection('userMemberships')
        .doc('cashier_a_org_pricing_a')
        .set({
          userId: 'cashier_a',
          organizationId: 'org_pricing_a',
          role: 'CASHIER',
          status: 'ACTIVE',
        });

      // Suspended member in Org A
      await adminDb
        .collection('userMemberships')
        .doc('suspended_a_org_pricing_a')
        .set({
          userId: 'suspended_a',
          organizationId: 'org_pricing_a',
          role: 'CASHIER',
          status: 'SUSPENDED',
        });

      // Active member in Org B
      await adminDb
        .collection('userMemberships')
        .doc('member_b_org_pricing_b')
        .set({
          userId: 'member_b',
          organizationId: 'org_pricing_b',
          role: 'MANAGER',
          status: 'ACTIVE',
        });

      // Seed documents in Org A
      await adminDb
        .collection('organizations')
        .doc('org_pricing_a')
        .collection('taxConfigurations')
        .doc('tax_18')
        .set({
          name: 'GST 18%',
          ratePercent: 18,
          status: 'ACTIVE',
        });

      await adminDb
        .collection('organizations')
        .doc('org_pricing_a')
        .collection('pricingRules')
        .doc('rule_1')
        .set({
          level: 'STORE',
          priceMinor: 5000,
          status: 'ACTIVE',
        });
    });

    const cashierDb = testEnv.authenticatedContext('cashier_a').firestore();
    const crossTenantDb = testEnv.authenticatedContext('member_b').firestore();
    const suspendedDb = testEnv.authenticatedContext('suspended_a').firestore();

    const taxDocRefA = cashierDb
      .collection('organizations')
      .doc('org_pricing_a')
      .collection('taxConfigurations')
      .doc('tax_18');

    const ruleDocRefA = cashierDb
      .collection('organizations')
      .doc('org_pricing_a')
      .collection('pricingRules')
      .doc('rule_1');

    // 1. Active member in Org A can read tax configurations and pricing rules
    await assertSucceeds(taxDocRefA.get());
    await assertSucceeds(ruleDocRefA.get());

    // 2. Member of Org B cannot read Org A documents (cross-tenant rejected)
    const crossTenantTaxRef = crossTenantDb
      .collection('organizations')
      .doc('org_pricing_a')
      .collection('taxConfigurations')
      .doc('tax_18');

    const crossTenantRuleRef = crossTenantDb
      .collection('organizations')
      .doc('org_pricing_a')
      .collection('pricingRules')
      .doc('rule_1');

    await assertFails(crossTenantTaxRef.get());
    await assertFails(crossTenantRuleRef.get());

    // 3. Suspended member in Org A cannot read Org A documents
    const suspendedTaxRef = suspendedDb
      .collection('organizations')
      .doc('org_pricing_a')
      .collection('taxConfigurations')
      .doc('tax_18');

    await assertFails(suspendedTaxRef.get());
  });

  it('SEC-TC-PRICING-03-AUDIT-PIM-05-04: Pricing history reads are strictly restricted to OWNER and MANAGER, denying CASHIER, INVENTORY_MGR, ACCOUNTANT, and suspended members', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.collection('organizations').doc('org_audit_hist').set({
        name: 'Audit Org',
        status: 'ACTIVE',
      });

      // Memberships for all Phase 1 roles
      const roles = [
        { uid: 'u_owner', role: 'OWNER', status: 'ACTIVE' },
        { uid: 'u_manager', role: 'MANAGER', status: 'ACTIVE' },
        { uid: 'u_cashier', role: 'CASHIER', status: 'ACTIVE' },
        { uid: 'u_inv_mgr', role: 'INVENTORY_MANAGER', status: 'ACTIVE' },
        { uid: 'u_accountant', role: 'ACCOUNTANT', status: 'ACTIVE' },
        { uid: 'u_suspended', role: 'MANAGER', status: 'SUSPENDED' },
      ];

      for (const m of roles) {
        await adminDb
          .collection('userMemberships')
          .doc(`${m.uid}_org_audit_hist`)
          .set({
            userId: m.uid,
            organizationId: 'org_audit_hist',
            role: m.role,
            status: m.status,
          });
      }

      await adminDb
        .collection('organizations')
        .doc('org_audit_hist')
        .collection('pricingHistory')
        .doc('hist_sec_1')
        .set({
          oldPriceMinor: 10000,
          newPriceMinor: 9500,
          costPriceMinor: 7000,
        });
    });

    const ownerDb = testEnv.authenticatedContext('u_owner').firestore();
    const managerDb = testEnv.authenticatedContext('u_manager').firestore();
    const cashierDb = testEnv.authenticatedContext('u_cashier').firestore();
    const invMgrDb = testEnv.authenticatedContext('u_inv_mgr').firestore();
    const accountantDb = testEnv.authenticatedContext('u_accountant').firestore();
    const suspendedDb = testEnv.authenticatedContext('u_suspended').firestore();

    const getHistRef = (dbInstance: any) =>
      dbInstance
        .collection('organizations')
        .doc('org_audit_hist')
        .collection('pricingHistory')
        .doc('hist_sec_1');

    // 1. OWNER and MANAGER: PERMITTED
    await assertSucceeds(getHistRef(ownerDb).get());
    await assertSucceeds(getHistRef(managerDb).get());

    // 2. CASHIER: DENIED
    await assertFails(getHistRef(cashierDb).get());

    // 3. INVENTORY_MANAGER: DENIED
    await assertFails(getHistRef(invMgrDb).get());

    // 4. ACCOUNTANT: DENIED
    await assertFails(getHistRef(accountantDb).get());

    // 5. SUSPENDED MEMBER: DENIED
    await assertFails(getHistRef(suspendedDb).get());
  });

  // --- 19. Variant Restricted Pricing Security (AUDIT-COST-PRICE-SECURITY) ---
  it('SEC-TC-PRICING-04-RESTRICTED-MARGINS: strictly isolates variant costPrice and margins to OWNER and MANAGER', async () => {
    const orgId = 'org_variant_cost';
    const prodId = 'prod_test_margin';
    const varId = 'var_test_margin_1';

    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const adminDb = adminContext.firestore();

      // Seed organization
      await adminDb.collection('organizations').doc(orgId).set({
        id: orgId,
        name: 'Cost Security Retail',
        status: 'ACTIVE',
      });

      // Seed memberships for various roles
      const members = [
        { uid: 'u_owner_cost', role: 'OWNER', status: 'ACTIVE' },
        { uid: 'u_manager_cost', role: 'MANAGER', status: 'ACTIVE' },
        { uid: 'u_cashier_cost', role: 'CASHIER', status: 'ACTIVE' },
        { uid: 'u_inv_mgr_cost', role: 'INVENTORY_MANAGER', status: 'ACTIVE' },
        { uid: 'u_accountant_cost', role: 'ACCOUNTANT', status: 'ACTIVE' },
        { uid: 'u_suspended_cost', role: 'MANAGER', status: 'SUSPENDED' },
      ];

      for (const m of members) {
        await adminDb
          .collection('userMemberships')
          .doc(`${m.uid}_${orgId}`)
          .set({
            userId: m.uid,
            organizationId: orgId,
            role: m.role,
            status: m.status,
          });
      }

      // Seed base variant document (public retail pricing only)
      await adminDb
        .collection('organizations')
        .doc(orgId)
        .collection('products')
        .doc(prodId)
        .set({
          id: prodId,
          name: 'Public Product',
        });

      await adminDb
        .collection('organizations')
        .doc(orgId)
        .collection('products')
        .doc(prodId)
        .collection('variants')
        .doc(varId)
        .set({
          id: varId,
          sku: 'SKU-COST-TEST',
          pricing: {
            mrp: 15000,
            sellingPrice: 12000,
          },
          status: 'ACTIVE',
        });

      // Seed protected restrictedPricing subcollection
      await adminDb
        .collection('organizations')
        .doc(orgId)
        .collection('products')
        .doc(prodId)
        .collection('variants')
        .doc(varId)
        .collection('restrictedPricing')
        .doc('current')
        .set({
          id: 'current',
          organizationId: orgId,
          productId: prodId,
          variantId: varId,
          costPrice: 7000,
          wholesalePrice: 9500,
          minimumSellingPrice: 10000,
        });
    });

    const ownerDb = testEnv.authenticatedContext('u_owner_cost').firestore();
    const managerDb = testEnv.authenticatedContext('u_manager_cost').firestore();
    const cashierDb = testEnv.authenticatedContext('u_cashier_cost').firestore();
    const invMgrDb = testEnv.authenticatedContext('u_inv_mgr_cost').firestore();
    const accountantDb = testEnv.authenticatedContext('u_accountant_cost').firestore();
    const suspendedDb = testEnv.authenticatedContext('u_suspended_cost').firestore();
    const unauthedDb = testEnv.unauthenticatedContext().firestore();

    const getBaseVariantRef = (dbInstance: any) =>
      dbInstance
        .collection('organizations')
        .doc(orgId)
        .collection('products')
        .doc(prodId)
        .collection('variants')
        .doc(varId);

    const getRestrictedPricingRef = (dbInstance: any) =>
      dbInstance
        .collection('organizations')
        .doc(orgId)
        .collection('products')
        .doc(prodId)
        .collection('variants')
        .doc(varId)
        .collection('restrictedPricing')
        .doc('current');

    // 1. Ordinary variant reads succeed for all active members (Cashier, Inventory Mgr, Accountant, etc.)
    await assertSucceeds(getBaseVariantRef(ownerDb).get());
    await assertSucceeds(getBaseVariantRef(managerDb).get());
    await assertSucceeds(getBaseVariantRef(cashierDb).get());
    await assertSucceeds(getBaseVariantRef(invMgrDb).get());
    await assertSucceeds(getBaseVariantRef(accountantDb).get());

    // 2. Restricted pricing reads: OWNER and MANAGER permitted
    await assertSucceeds(getRestrictedPricingRef(ownerDb).get());
    await assertSucceeds(getRestrictedPricingRef(managerDb).get());

    // 3. Restricted pricing reads: CASHIER, INVENTORY_MANAGER, ACCOUNTANT strictly DENIED
    await assertFails(getRestrictedPricingRef(cashierDb).get());
    await assertFails(getRestrictedPricingRef(invMgrDb).get());
    await assertFails(getRestrictedPricingRef(accountantDb).get());

    // 4. Restricted pricing reads: SUSPENDED and unauthenticated DENIED
    await assertFails(getRestrictedPricingRef(suspendedDb).get());
    await assertFails(getRestrictedPricingRef(unauthedDb).get());

    // 5. Direct client writes to restricted pricing are strictly DENIED for all roles (server-only via Cloud Functions)
    await assertFails(
      getRestrictedPricingRef(ownerDb).set({
        costPrice: 5000,
      })
    );
    await assertFails(
      getRestrictedPricingRef(managerDb).update({
        costPrice: 5000,
      })
    );
  });
});
