import { z } from "zod";

export const userSchema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(120),
  roleId: z.string().min(1),
  department: z.string().trim().max(80).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE")
});

export type UserInput = z.infer<typeof userSchema>;

