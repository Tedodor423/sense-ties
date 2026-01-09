import { z } from 'zod';

// Registration validation
export const registerSchema = z.object({
  email: z.string()
    .trim()
    .email('Please enter a valid email address')
    .max(254, 'Email must be less than 254 characters'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be less than 72 characters'),
  firstName: z.string()
    .trim()
    .min(1, 'First name is required')
    .max(50, 'First name must be less than 50 characters'),
  lastName: z.string()
    .trim()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be less than 50 characters'),
  role: z.enum(['Parent', 'Teacher', 'Clinician']),
});

// Child validation
export const childSchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  age: z.number()
    .int('Age must be a whole number')
    .min(1, 'Age must be at least 1')
    .max(25, 'Age must be 25 or less'),
});

// Share email validation
export const shareEmailSchema = z.object({
  email: z.string()
    .trim()
    .email('Please enter a valid email address')
    .max(254, 'Email must be less than 254 characters'),
});

// Meltdown validation
export const meltdownSchema = z.object({
  location: z.string().max(200, 'Location must be less than 200 characters').optional().nullable(),
  environmentDescription: z.string().max(2000, 'Description must be less than 2000 characters').optional().nullable(),
  customDuration: z.string().max(50, 'Duration must be less than 50 characters').optional().nullable(),
  otherFeeling: z.string().max(100, 'Must be less than 100 characters').optional().nullable(),
  otherResolution: z.string().max(200, 'Must be less than 200 characters').optional().nullable(),
});

// UUID validation helper
export const uuidSchema = z.string().uuid('Invalid ID format');

// Helper function to safely parse and get errors
export function validateField<T>(schema: z.ZodSchema<T>, data: unknown): { success: boolean; data?: T; error?: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.errors[0]?.message || 'Validation failed' };
}

// Helper to validate entire form
export function validateForm<T>(schema: z.ZodSchema<T>, data: unknown): { success: boolean; data?: T; errors?: Record<string, string> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: Record<string, string> = {};
  result.error.errors.forEach((err) => {
    const path = err.path.join('.');
    if (!errors[path]) {
      errors[path] = err.message;
    }
  });
  return { success: false, errors };
}
