import * as admin from 'firebase-admin';
import { db } from '../../config/firebase';
import type { UserProfileDocument } from '../../shared/types';

export async function syncUserProfile(
  userId: string,
  email: string,
  displayName?: string,
  phoneNumber?: string
): Promise<UserProfileDocument> {
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();

  const now = admin.firestore.Timestamp.now();

  if (!userSnap.exists) {
    const newProfile: UserProfileDocument = {
      id: userId,
      email,
      phoneNumber: phoneNumber || undefined,
      displayName: displayName || email.split('@')[0],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await userRef.set(newProfile);
    return newProfile;
  }

  const existing = userSnap.data() as UserProfileDocument;
  const updates: Partial<UserProfileDocument> = {
    updatedAt: now,
  };

  if (displayName && displayName !== existing.displayName) {
    updates.displayName = displayName;
  }
  if (phoneNumber && phoneNumber !== existing.phoneNumber) {
    updates.phoneNumber = phoneNumber;
  }

  await userRef.update(updates);
  return { ...existing, ...updates };
}
