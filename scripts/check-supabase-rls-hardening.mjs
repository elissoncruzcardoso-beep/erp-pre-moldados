import { readFileSync } from "node:fs";
import path from "node:path";

const hardeningPath = path.join("docs", "security", "supabase_rls_hardening.sql");

function stripSqlComments(sql) {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function includesPattern(sql, pattern) {
  return pattern.test(sql.replace(/\s+/g, " "));
}

export function collectSupabaseRlsHardeningErrors({ cwd = process.cwd() } = {}) {
  const fullPath = path.join(cwd, hardeningPath);
  let sql = "";

  try {
    sql = readFileSync(fullPath, "utf8");
  } catch {
    return [`Arquivo obrigatorio nao encontrado: ${hardeningPath}`];
  }

  const activeSql = stripSqlComments(sql);
  const errors = [];

  const requiredPatterns = [
    {
      label: "habilitar RLS nas tabelas publicas",
      pattern: /alter\s+table\s+%I\.%I\s+enable\s+row\s+level\s+security/i
    },
    {
      label: "revogar tabelas para anon/authenticated",
      pattern: /revoke\s+all\s+privileges\s+on\s+all\s+tables\s+in\s+schema\s+public\s+from\s+anon\s*,\s*authenticated\s*,\s*public/i
    },
    {
      label: "revogar sequencias para anon/authenticated",
      pattern: /revoke\s+all\s+privileges\s+on\s+all\s+sequences\s+in\s+schema\s+public\s+from\s+anon\s*,\s*authenticated\s*,\s*public/i
    },
    {
      label: "revogar funcoes para anon/authenticated",
      pattern: /revoke\s+all\s+privileges\s+on\s+all\s+functions\s+in\s+schema\s+public\s+from\s+anon\s*,\s*authenticated\s*,\s*public/i
    },
    {
      label: "revogar privilegios padrao de tabelas",
      pattern: /alter\s+default\s+privileges\s+in\s+schema\s+public\s+revoke\s+all\s+on\s+tables\s+from\s+anon/i
    },
    {
      label: "revogar privilegios padrao de sequencias",
      pattern: /alter\s+default\s+privileges\s+in\s+schema\s+public\s+revoke\s+all\s+on\s+sequences\s+from\s+anon/i
    },
    {
      label: "revogar privilegios padrao de funcoes",
      pattern: /alter\s+default\s+privileges\s+in\s+schema\s+public\s+revoke\s+all\s+on\s+functions\s+from\s+anon/i
    }
  ];

  for (const requirement of requiredPatterns) {
    if (!includesPattern(activeSql, requirement.pattern)) {
      errors.push(`Hardening Supabase incompleto: falta ${requirement.label}.`);
    }
  }

  const forbiddenPatterns = [
    {
      label: "grant ativo para anon/authenticated",
      pattern: /\bgrant\b[\s\S]*?\bto\s+(anon|authenticated|public)\b/i
    },
    {
      label: "policy permissiva TRUE",
      pattern: /\bcreate\s+policy\b[\s\S]*?\b(using|with\s+check)\s*\(\s*true\s*\)/i
    },
    {
      label: "policy ativa para anon",
      pattern: /\bcreate\s+policy\b[\s\S]*?\bto\s+(anon|public)\b/i
    }
  ];

  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(activeSql)) {
      errors.push(`Hardening Supabase inseguro: ${rule.label}.`);
    }
  }

  if (!/auth\.uid\(\)/i.test(sql) || !/nao\s+run\s+this\s+block\s+blindly|do not run this block blindly/i.test(sql)) {
    errors.push("Inclua aviso claro para nao aplicar policies auth.uid() sem migrar para Supabase Auth.");
  }

  return errors;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? new URL(import.meta.url).pathname);

if (isMain) {
  const errors = collectSupabaseRlsHardeningErrors();

  if (errors.length > 0) {
    console.error("Falha na validacao do hardening Supabase RLS.");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("OK: hardening Supabase RLS documentado e sem grants publicos ativos.");
}
