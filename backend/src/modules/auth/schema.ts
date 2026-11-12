import { z } from 'zod';

export const loginSchema = z.object({
  matricula: z.string().trim().min(1).max(20),
  senha: z.string().min(1).refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
}).strict();
