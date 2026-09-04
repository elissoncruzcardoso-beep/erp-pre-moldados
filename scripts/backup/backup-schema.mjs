const SAFE_SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/i;

export function resolveBackupSchema(value = process.env.BACKUP_DATABASE_SCHEMA) {
  const schema = String(value || "public").trim();

  if (!SAFE_SCHEMA_NAME.test(schema)) {
    throw new Error("BACKUP_DATABASE_SCHEMA invalido. Use apenas letras, numeros e sublinhado.");
  }

  return schema;
}
