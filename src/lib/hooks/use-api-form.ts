"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { fetchJson, isApiRequestError } from "@/lib/api-client";
import { formatValidationError } from "@/lib/validations/client";

type UseApiFormOptions<TSchema extends z.ZodTypeAny> = {
  endpoint: string;
  method?: "POST" | "PATCH" | "PUT";
  schema: TSchema;
  fallbackError: string;
  successMessage: string;
  resetOnSuccess?: boolean;
  refreshOnSuccess?: boolean;
  buildPayload?: (formData: FormData) => unknown;
  onSuccess?: (form: HTMLFormElement) => void;
};

export function useApiForm<TSchema extends z.ZodTypeAny>({
  endpoint,
  method = "POST",
  schema,
  fallbackError,
  successMessage,
  resetOnSuccess = true,
  refreshOnSuccess = true,
  buildPayload = (formData) => Object.fromEntries(formData.entries()),
  onSuccess
}: UseApiFormOptions<TSchema>) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const form = event.currentTarget;
    const parsed = schema.safeParse(buildPayload(new FormData(form)));

    if (!parsed.success) {
      setError(formatValidationError(parsed.error));
      return;
    }

    setLoading(true);

    try {
      await fetchJson(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data)
      }, fallbackError);

      setSuccess(successMessage);
      if (resetOnSuccess) form.reset();
      onSuccess?.(form);
      if (refreshOnSuccess) router.refresh();
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : fallbackError);
    } finally {
      setLoading(false);
    }
  }

  return {
    error,
    success,
    loading,
    handleSubmit
  };
}
