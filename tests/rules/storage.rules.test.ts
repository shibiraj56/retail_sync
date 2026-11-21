import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

describe('Firebase Storage Security Rules Test Suite', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const storageRules = fs.readFileSync(path.resolve(__dirname, '../../storage.rules'), 'utf8');
    const firestoreRules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');

    testEnv = await initializeTestEnvironment({
      projectId: 'demo-retail-sync',
      storage: {
        host: '127.0.0.1',
        port: 9199,
        rules: storageRules,
      },
      firestore: {
        host: '127.0.0.1',
        port: 8080,
        rules: firestoreRules,
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
      await testEnv.clearStorage();
    }
  });

  // Small valid PNG dummy buffer (68 bytes)
  const validPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  it('SEC-STORAGE-01: should allow an authorized active organization member to upload a valid product image', async () => {
    // 1. Seed authoritative active membership in Firestore
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('storage_user_1_org_alpha').set({
        userId: 'storage_user_1',
        organizationId: 'org_alpha',
        role: 'MANAGER',
        status: 'ACTIVE',
      });
    });

    const userContext = testEnv.authenticatedContext('storage_user_1');
    const storageRef = userContext
      .storage()
      .ref('organizations/org_alpha/products/prod_101/thumbnail.png');

    await assertSucceeds(
      Promise.resolve(
        storageRef.put(validPngBuffer, {
          contentType: 'image/png',
        })
      )
    );
  });

  it('SEC-STORAGE-02: should strictly reject cross-tenant uploads (Org A member uploading to Org B)', async () => {
    // User belongs ONLY to org_alpha
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('storage_user_1_org_alpha').set({
        userId: 'storage_user_1',
        organizationId: 'org_alpha',
        role: 'MANAGER',
        status: 'ACTIVE',
      });
    });

    const userContext = testEnv.authenticatedContext('storage_user_1');
    // Attempt upload to foreign tenant (org_bravo)
    const foreignStorageRef = userContext
      .storage()
      .ref('organizations/org_bravo/products/prod_999/attack.png');

    await assertFails(
      Promise.resolve(
        foreignStorageRef.put(validPngBuffer, {
          contentType: 'image/png',
        })
      )
    );
  });

  it('SEC-STORAGE-03: should reject upload if user membership is SUSPENDED', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('suspended_user_org_alpha').set({
        userId: 'suspended_user_1',
        organizationId: 'org_alpha',
        role: 'MANAGER',
        status: 'SUSPENDED',
      });
    });

    const suspendedContext = testEnv.authenticatedContext('suspended_user_1');
    const storageRef = suspendedContext
      .storage()
      .ref('organizations/org_alpha/products/prod_101/pic.png');

    await assertFails(
      Promise.resolve(
        storageRef.put(validPngBuffer, {
          contentType: 'image/png',
        })
      )
    );
  });

  it('SEC-STORAGE-04: should reject files exceeding the 5MB size limit', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('storage_user_1_org_alpha').set({
        userId: 'storage_user_1',
        organizationId: 'org_alpha',
        role: 'MANAGER',
        status: 'ACTIVE',
      });
    });

    const userContext = testEnv.authenticatedContext('storage_user_1');
    const storageRef = userContext
      .storage()
      .ref('organizations/org_alpha/products/prod_101/large_image.jpg');

    // 5.2 MB buffer (exceeds 5 * 1024 * 1024 bytes)
    const oversizedBuffer = Buffer.alloc(5.2 * 1024 * 1024);

    await assertFails(
      Promise.resolve(
        storageRef.put(oversizedBuffer, {
          contentType: 'image/jpeg',
        })
      )
    );
  });

  it('SEC-STORAGE-05: should reject non-image file uploads (e.g. text or pdf)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('storage_user_1_org_alpha').set({
        userId: 'storage_user_1',
        organizationId: 'org_alpha',
        role: 'MANAGER',
        status: 'ACTIVE',
      });
    });

    const userContext = testEnv.authenticatedContext('storage_user_1');
    const scriptRef = userContext
      .storage()
      .ref('organizations/org_alpha/products/prod_101/payload.pdf');

    await assertFails(
      Promise.resolve(
        scriptRef.put(Buffer.from('%PDF-1.4 dummy pdf content'), {
          contentType: 'application/pdf',
        })
      )
    );
  });

  it('SEC-STORAGE-06: should allow an authorized organization member to delete an existing product image', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('storage_user_1_org_alpha').set({
        userId: 'storage_user_1',
        organizationId: 'org_alpha',
        role: 'OWNER',
        status: 'ACTIVE',
      });
    });

    const userContext = testEnv.authenticatedContext('storage_user_1');
    const storageRef = userContext
      .storage()
      .ref('organizations/org_alpha/products/prod_101/to_delete.png');

    // Upload first
    await assertSucceeds(
      Promise.resolve(
        storageRef.put(validPngBuffer, {
          contentType: 'image/png',
        })
      )
    );

    // Delete must succeed
    await assertSucceeds(storageRef.delete());
  });

  it('SEC-STORAGE-07: should reject image deletion by unauthenticated or unauthorized users', async () => {
    // 1. Legitimate user uploads image
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('userMemberships').doc('storage_user_1_org_alpha').set({
        userId: 'storage_user_1',
        organizationId: 'org_alpha',
        role: 'OWNER',
        status: 'ACTIVE',
      });
    });

    const legitContext = testEnv.authenticatedContext('storage_user_1');
    const imageRef = legitContext
      .storage()
      .ref('organizations/org_alpha/products/prod_101/secure_pic.png');

    await assertSucceeds(
      Promise.resolve(
        imageRef.put(validPngBuffer, {
          contentType: 'image/png',
        })
      )
    );

    // 2. Stranger (no membership in org_alpha) attempts delete
    const strangerContext = testEnv.authenticatedContext('stranger_hacker');
    const strangerRef = strangerContext
      .storage()
      .ref('organizations/org_alpha/products/prod_101/secure_pic.png');

    await assertFails(strangerRef.delete());
  });
});
