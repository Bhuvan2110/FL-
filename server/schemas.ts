import { z } from 'zod'

export const AlgorithmSchema = z.enum(['central', 'fedavg', 'fedprox', 'scaffold', 'krum', 'dpsgd'])
export type Algorithm = z.infer<typeof AlgorithmSchema>

export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const SigninSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export const RoleUpdateSchema = z.object({
  user_id: z.string(),
  role: z.enum(['user', 'admin', 'super_admin']),
})

export const SyntheticDatasetSchema = z.object({
  n_rows: z.number().int().min(10).max(20000).default(600),
  n_features: z.number().int().min(1).max(100).optional(),
  seed: z.number().int().optional(),
  dataset_name: z.string().optional(),
  field: z.string().optional(),
  feature_names: z.array(z.string()).optional(),
  label_col: z.string().optional(),
})

export const TrainSchema = z.object({
  dataset_id: z.string(),
  algorithm: AlgorithmSchema.default('fedavg'),
  rounds: z.number().int().min(1).max(200).default(20),
  lr: z.number().gt(0).default(0.4),
  local_epochs: z.number().int().min(1).max(50).default(3),
  num_clients: z.number().int().min(1).max(64).default(4),
  iid: z.boolean().default(true),
  alpha: z.number().nullable().optional(),
  mu: z.number().min(0).default(0.01),
  clip_norm: z.number().gt(0).default(1.0),
  noise_multiplier: z.number().min(0).default(1.1),
  delta: z.number().gt(0).lt(1).default(1e-5),
})

export const PredictSchema = z.object({
  experiment_id: z.string(),
  mode: z.enum(['single', 'batch']).default('single'),
  features: z.record(z.unknown()).optional(),
  rows: z.array(z.record(z.unknown())).optional(),
})
