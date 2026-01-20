import { z } from 'zod';

// Helper to calculate age from birth month/year
export function calculateAge(birthMonth: number | null, birthYear: number | null): number | null {
  if (!birthMonth || !birthYear) return null;
  
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // getMonth() is 0-indexed
  
  let age = currentYear - birthYear;
  
  // Subtract 1 if birthday hasn't occurred yet this year
  if (currentMonth < birthMonth) {
    age -= 1;
  }
  
  return age;
}

// Helper to format age display
export function formatAge(birthMonth: number | null, birthYear: number | null): string {
  const age = calculateAge(birthMonth, birthYear);
  if (age === null) return 'Age unknown';
  return `Age: ${age}`;
}

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
  birth_month: z.number()
    .int('Month must be a whole number')
    .min(1, 'Month must be between 1 and 12')
    .max(12, 'Month must be between 1 and 12'),
  birth_year: z.number()
    .int('Year must be a whole number')
    .min(1900, 'Year must be 1900 or later')
    .max(new Date().getFullYear(), `Year cannot be in the future`),
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
