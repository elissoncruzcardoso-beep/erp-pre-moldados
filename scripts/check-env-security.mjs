import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const placeholderPatterns = [
  /troque-por/i,
  /cole-aqui/i,
  /crie-uma-chave/i,
  /usuario:senha/i,
  /SENHA/i,
  /PROJECT_REF/i,
  /^ci-(token|cron-secret|webhook-secret)$/i
];

export function loadDotEnv(file, { cwd = process.cwd(), env = process.env } = {}) {
  const envPath = path.resolve(cwd, file);
  if (!existsSync(envPath)) return;

  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (env[key]) continue;
    env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }
}

function isPlaceholder(value) {
  return placeholderPatterns.some((pattern) => pattern.test(value));
}

function addError(errors, key, message) {
  errors.push(`${key}: ${message}`);
}

function addWarning(warnings, key, message) {
  warnings.push(`${key}: ${message}`);
}

function requireSecret(errors, env, key, minLength) {
  const value = env[key] || "";

  if (!value) {
    addError(errors, key, "ausente");
    return;
  }

  if (isPlaceholder(value)) {
    addError(errors, key, "valor placeholder");
  }

  if (value.length < minLength) {
    addError(errors, key, `precisa ter pelo menos ${minLength} caracteres`);
  }
}

function requireUrl(errors, env, key) {
  const value = env[key] || "";

  if (!value) {
    addError(errors, key, "ausente");
    return;
  }

  if (isPlaceholder(value)) {
    addError(errors, key, "valor placeholder");
    return;
  }

  try {
    const url = new URL(value);
    if (!["postgresql:", "postgres:"].includes(url.protocol)) {
      addError(errors, key, "protocolo precisa ser PostgreSQL");
    }
  } catch {
    addError(errors, key, "URL invalida");
  }
}

function isSupabaseDirectHost(hostname) {
  return /^db\.[a-z0-9-]+\.supabase\.co$/i.test(hostname);
}

function isSupabasePoolerHost(hostname) {
  return hostname.includes("pooler.supabase.com") || hostname.includes("pooler");
}

function validateVercelDatabasePooler(errors, env) {
  const databaseUrl = env.DATABASE_URL || "";

  if (!env.VERCEL || !databaseUrl || isPlaceholder(databaseUrl)) {
    return;
  }

  try {
    const url = new URL(databaseUrl);

    if (isSupabaseDirectHost(url.hostname) && !isSupabasePoolerHost(url.hostname)) {
      addError(
        errors,
        "DATABASE_URL",
        "em ambiente Vercel precisa usar a connection string do Supabase pooler, nao o host direto db.PROJECT_REF.supabase.co"
      );
    }
  } catch {
    // URL invalida ja e tratada em requireUrl.
  }
}

export function collectEnvSecurityErrors(env = process.env) {
  const errors = [];

  requireUrl(errors, env, "DATABASE_URL");
  validateVercelDatabasePooler(errors, env);
  requireSecret(errors, env, "AUTH_SECRET", 44);
  requireSecret(errors, env, "CRON_SECRET", 32);

  if (env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_WEBHOOK_SECRET) {
    requireSecret(errors, env, "TELEGRAM_WEBHOOK_SECRET", 32);
  }

  if (env.ADMIN_SETUP_ENABLED === "true" && env.NODE_ENV === "production") {
    addError(errors, "ADMIN_SETUP_ENABLED", "nao pode ficar ativo em producao");
  }

  return errors;
}

export function collectEnvSecurityWarnings(env = process.env) {
  const warnings = [];
  const databaseUrl = env.DATABASE_URL || "";

  if (!env.VERCEL && databaseUrl) {
    try {
      const url = new URL(databaseUrl);

      if (isSupabaseDirectHost(url.hostname) && !isSupabasePoolerHost(url.hostname)) {
        addWarning(
          warnings,
          "DATABASE_URL",
          "parece conexao direta do Supabase; em Vercel isso sera bloqueado e deve ser trocado pela connection string do pooler"
        );
      }
    } catch {
      // URL invalida ja e tratada como erro em collectEnvSecurityErrors.
    }
  }

  return warnings;
}

export function checkEnvFile(envFile = ".env", { cwd = process.cwd(), baseEnv = process.env } = {}) {
  const env = { ...baseEnv };
  loadDotEnv(envFile, { cwd, env });
  return collectEnvSecurityErrors(env);
}

function main() {
  const args = process.argv.slice(2);
  const envFileArgIndex = args.indexOf("--env-file");
  const envFile = envFileArgIndex >= 0 ? args[envFileArgIndex + 1] : ".env";
  const env = { ...process.env };
  loadDotEnv(envFile, { env });
  const errors = collectEnvSecurityErrors(env);
  const warnings = collectEnvSecurityWarnings(env);

  for (const warning of warnings) {
    console.warn(`AVISO - ${warning}`);
  }

  if (errors.length > 0) {
    console.error("Configuracao de ambiente insegura:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("OK: ambiente principal validado sem segredos fracos ou placeholders.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
