import { z } from "zod";

export const roleSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(180).optional().nullable(),
  permissionIds: z.array(z.string().min(1)).min(1, "Selecione ao menos uma permissão.")
});

export type RoleInput = z.infer<typeof roleSchema>;
