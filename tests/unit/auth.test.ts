import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const RegisterSchema = z
  .object({
    displayName: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Confirm password is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

describe('Authentication Validation Unit Tests', () => {
  it('should accept valid registration payloads', () => {
    const validData = {
      displayName: 'Rajesh Kumar',
      email: 'rajesh@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    };
    const result = RegisterSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject registration when passwords do not match', () => {
    const invalidData = {
      displayName: 'Rajesh Kumar',
      email: 'rajesh@example.com',
      password: 'password123',
      confirmPassword: 'differentpassword',
    };
    const result = RegisterSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Passwords do not match');
    }
  });

  it('should reject invalid email formats', () => {
    const invalidEmail = {
      displayName: 'Rajesh Kumar',
      email: 'invalid-email-address',
      password: 'password123',
      confirmPassword: 'password123',
    };
    const result = RegisterSchema.safeParse(invalidEmail);
    expect(result.success).toBe(false);
  });

  it('should accept valid login credentials', () => {
    const validLogin = {
      email: 'owner@retail.com',
      password: 'secretPassword',
    };
    const result = LoginSchema.safeParse(validLogin);
    expect(result.success).toBe(true);
  });

  it('should reject login passwords under 6 characters', () => {
    const shortPassword = {
      email: 'owner@retail.com',
      password: '123',
    };
    const result = LoginSchema.safeParse(shortPassword);
    expect(result.success).toBe(false);
  });
});
