import { z } from "zod";

const LiquidityTokenSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toUpperCase();
  // User-facing shorthand; store canonical OP-20 symbol everywhere else.
  if (normalized === "PIL") return "PILL";
  return normalized;
}, z.enum(["BTC", "TBTC", "MOTO", "PILL"]));

export const CreateProjectSchema = z.object({
  name: z.string().min(2).max(80),
  ticker: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z0-9]+$/, "Ticker must be uppercase letters/numbers only"),
  decimals: z.number().int().min(0).max(18).default(18),
  maxSupply: z
    .string()
    .regex(/^\d+$/, "maxSupply must be a positive integer string")
    .default("1000000000"),
  description: z.string().min(10).max(2000),
  links: z
    .record(z.string().url())
    .default({}),
  iconUrl: z.string().url().optional(),
  sourceRepoUrl: z.string().url().optional(),
  liquidityToken: LiquidityTokenSchema.optional(),
  liquidityAmount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "liquidityAmount must be a positive number string")
    .refine((v) => Number(v) > 0, "liquidityAmount must be greater than 0")
    .optional(),
  liquidityFundingTx: z.string().min(8).optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
