import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

describe('Firestore Security Rules Unit Tests', () => {
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

  it('SEC-TC-PROFILE: should allow users to read and update their own global profile', async () => {
    const aliceContext = testEnv.authenticatedContext('alice_123', {
      email: 'alice@retail.com',
    });
    const db = aliceContext.firestore();

    const userDocRef = db.collection('users').doc('alice_123');
    await assertSucceeds(
      userDocRef.set({
        displayName: 'Alice Retailer',
        email: 'alice@retail.com',
      })
    );

    const bobContext = testEnv.authenticatedContext('bob_456', {
      email: 'bob@retail.com',
    });
    const bobDb = bobContext.firestore();
    // Bob should not be able to write to Alice's profile
    await assertFails(
      bobDb.collection('users').doc('alice_123').set({
        displayName: 'Malicious Bob Overwrite',
      })
    );
  });

  it('SEC-TC-MEMBERSHIP: should forbid direct client writes to userMemberships collection', async () => {
    const aliceContext = testEnv.authenticatedContext('alice_123', {
      email: 'alice@retail.com',
    });
    const db = aliceContext.firestore();

    // Client attempts to grant themselves OWNER role directly
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

  it('SEC-TC-01: should reject cross-tenant reads (Org A user reading Org B store documents)', async () => {
    // Setup existing Org B document via admin context
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
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

    // Alice belongs to Org Alpha
    const aliceContext = testEnv.authenticatedContext('alice_123', {
      orgId: 'org_alpha',
      role: 'CASHIER',
    });
    const db = aliceContext.firestore();

    const storeRef = db
      .collection('organizations')
      .doc('org_bravo')
      .collection('stores')
      .doc('store_bravo_01');

    await assertFails(storeRef.get());
  });

  it('SEC-TC-02: should reject cross-tenant writes (Org A user writing to Org B products)', async () => {
    const aliceContext = testEnv.authenticatedContext('alice_123', {
      orgId: 'org_alpha',
      role: 'OWNER',
    });
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

  it('SEC-TC-05: should strictly forbid direct client writes to store inventory balances', async () => {
    const ownerContext = testEnv.authenticatedContext('alice_123', {
      orgId: 'org_alpha',
      role: 'OWNER',
      defaultStoreId: 'store_01',
    });
    const db = ownerContext.firestore();

    const inventoryRef = db
      .collection('organizations')
      .doc('org_alpha')
      .collection('stores')
      .doc('store_01')
      .collection('inventory')
      .doc('var_101');

    // Direct write must fail even for OWNER (must go through Cloud Function)
    await assertFails(
      inventoryRef.set({
        onHandQuantity: 99999,
        availableQuantity: 99999,
      })
    );
  });

  it('SEC-TC-06: should strictly forbid direct client writes to sales ledger', async () => {
    const cashierContext = testEnv.authenticatedContext('alice_123', {
      orgId: 'org_alpha',
      role: 'CASHIER',
      defaultStoreId: 'store_01',
    });
    const db = cashierContext.firestore();

    const saleRef = db
      .collection('organizations')
      .doc('org_alpha')
      .collection('stores')
      .doc('store_01')
      .collection('sales')
      .doc('sale_fake_123');

    // Direct sale creation must fail (must go through processCheckout Cloud Function)
    await assertFails(
      saleRef.set({
        invoiceNumber: 'FAKE/001',
        finalNetTotal: 0,
      })
    );
  });

  it('SEC-TC-07: should strictly forbid direct client writes to stock movements audit ledger', async () => {
    const ownerContext = testEnv.authenticatedContext('alice_123', {
      orgId: 'org_alpha',
      role: 'OWNER',
    });
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

  it('SEC-TC-HELD-BILL: should permit authorized cashiers to manage held bills for their assigned store', async () => {
    const cashierContext = testEnv.authenticatedContext('cashier_1', {
      orgId: 'org_alpha',
      role: 'CASHIER',
      defaultStoreId: 'store_01',
    });
    const db = cashierContext.firestore();

    const heldBillRef = db
      .collection('organizations')
      .doc('org_alpha')
      .collection('stores')
      .doc('store_01')
      .collection('heldBills')
      .doc('bill_parked_01');

    await assertSucceeds(
      heldBillRef.set({
        cashierUserId: 'cashier_1',
        items: [{ variantId: 'v1', quantity: 2, provisionalPrice: 50 }],
        heldAt: new Date(),
      })
    );

    // Cashier cannot touch held bills in unassigned store_02
    const otherStoreHeldBillRef = db
      .collection('organizations')
      .doc('org_alpha')
      .collection('stores')
      .doc('store_02')
      .collection('heldBills')
      .doc('bill_parked_02');

    await assertFails(
      otherStoreHeldBillRef.set({
        cashierUserId: 'cashier_1',
        items: [],
      })
    );
  });
});
