import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK once
if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();
export { Timestamp, FieldValue };

// Configure Firestore settings
db.settings({
  ignoreUndefinedProperties: true,
});
