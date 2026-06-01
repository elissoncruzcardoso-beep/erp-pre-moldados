import { z } from "zod";

export function formatValidationError(error: z.ZodError) {
  const firstIssue = error.issues[0];

  if (!firstIssue) {
    return "Revise os campos informados.";
  }

  const field = firstIssue.path.join(".");
  const prefix = field ? `${field}: ` : "";

  return `${prefix}${firstIssue.message}`;
}

