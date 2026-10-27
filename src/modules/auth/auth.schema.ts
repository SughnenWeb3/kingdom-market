import { z } from 'zod';

export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .max(254, 'Email must be at most 254 characters')
    .email('Invalid email format'),
  password: z
    .string()
    .min(6, 'Password must be at least 6ch aracters long')
    .max(72, 'Password must be at most 72 bytes')
    .refine((v) => v.trim().length > 0, 'Password cannot be whitespace-only'),
  displayName: z.string().min(1).max(60).optional(),
});

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
