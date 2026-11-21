import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
  type User,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, functions } from '../config/firebase';
import type { UserProfile } from '../types';

export const authService = {
  /**
   * Listen to Firebase Authentication state transitions
   */
  onAuthStateChanged(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  },

  /**
   * Log in with Email & Password
   */
  async login(email: string, password: string): Promise<User> {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  },

  /**
   * Register a new user with Email & Password and sync profile
   */
  async register(email: string, password: string, displayName: string): Promise<User> {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });

    // Refresh ID token to ensure active auth token with updated profile
    await cred.user.getIdToken(true);

    // Sync user profile to Firestore
    try {
      const syncUserCallable = httpsCallable(functions, 'syncUser');
      await syncUserCallable({ displayName });
    } catch (err) {
      console.warn('Failed to call syncUser callable:', err);
    }

    return cred.user;
  },

  /**
   * Send Password Reset Email
   */
  async forgotPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
  },

  /**
   * Log out current user
   */
  async logout(): Promise<void> {
    await signOut(auth);
  },

  /**
   * Fetch user profile from /users/{userId}
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  },
};
