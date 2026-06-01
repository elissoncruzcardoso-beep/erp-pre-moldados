import { execFileSync } from "node:child_process";
import { createGzip } from "node:zlib";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Client } from "pg";

const root = process.cwd();

function loadDotEnv(file = ".env") {
  const envPath = path.join(root, file);
  if (!existsSync(envPath)) return;

  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Configure ${name}.`);
  }
  return value;
}

function quoteIdent(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function aws(...args) {
  execFileSync("aws", args, { stdio: "inherit" });
}

function s3Path(...parts) {
  return parts
    .map((part) => String(part).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

loadDotEnv();

const databaseUrl = process.env.BACKUP_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Configure BACKUP_DATABASE_URL, DIRECT_URL ou DATABASE_URL.");
}

const bucket = requireEnv("BACKUP_S3_BUCKET");
const prefix = process.env.BACKUP_S3_PREFIX || "precast-erp/postgres";
const region = process.env.AWS_REGION;
const kmsKeyId = process.env.BACKUP_S3_KMS_KEY_ID;
const workDir = path.join(tmpdir(), "precast-erp-incremental-backup");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const cutoff = new Date();

mkdirSync(workDir, { recursive: true });

const statePath = path.join(workDir, "incremental-state.json");
const outputPath = path.join(workDir, `precast-erp-incremental-${timestamp}.jsonl`);
const gzipPath = `${outputPath}.gz`;
const stateS3 = `s3://${s3Path(bucket, prefix, "state", "incremental-state.json")}`;
const outputS3 = `s3://${s3Path(bucket, prefix, "incremental", cutoff.toISOString().slice(0, 10), path.basename(gzipPath))}`;

try {
  aws("s3", "cp", stateS3, statePath, "--only-show-errors", ...(region ? ["--region", region] : []));
} catch {
  writeFileSync(statePath, JSON.stringify({ tables: {} }, null, 2));
}

const state = JSON.parse(readFileSync(statePath, "utf8"));
state.tables ||= {};

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

const tablesResult = await client.query(`
  select
    table_name,
    bool_or(column_name = 'updatedAt') as has_updated_at,
    bool_or(column_name = 'createdAt') as has_created_at
  from information_schema.columns
  where table_schema = 'public'
    and table_name <> '_prisma_migrations'
  group by table_name
  having bool_or(column_name = 'updatedAt') or bool_or(column_name = 'createdAt')
  order by table_name
`);

const output = createWriteStream(outputPath, { encoding: "utf8" });
let totalRows = 0;
const summary = [];

for (const table of tablesResult.rows) {
  const tableName = table.table_name;
  const watermarkColumn = table.has_updated_at ? "updatedAt" : "createdAt";
  const previousWatermark = state.tables[tableName]?.watermark || "1970-01-01T00:00:00.000Z";

  const query = `
    select *
    from public.${quoteIdent(tableName)}
    where ${quoteIdent(watermarkColumn)} > $1
      and ${quoteIdent(watermarkColumn)} <= $2
    order by ${quoteIdent(watermarkColumn)} asc
  `;

  const rows = await client.query(query, [previousWatermark, cutoff.toISOString()]);

  for (const row of rows.rows) {
    output.write(JSON.stringify({
      table: tableName,
      watermarkColumn,
      exportedAt: cutoff.toISOString(),
      row
    }));
    output.write("\n");
  }

  totalRows += rows.rowCount;
  summary.push({ table: tableName, watermarkColumn, rows: rows.rowCount });
  state.tables[tableName] = { watermark: cutoff.toISOString(), watermarkColumn };
}

await new Promise((resolve, reject) => {
  output.end(resolve);
  output.on("error", reject);
});

await client.end();

await pipeline(
  createReadStream(outputPath),
  createGzip({ level: 9 }),
  createWriteStream(gzipPath)
);

const awsUploadArgs = [
  "s3",
  "cp",
  gzipPath,
  outputS3,
  "--only-show-errors",
  "--storage-class",
  "STANDARD_IA"
];
if (region) awsUploadArgs.push("--region", region);
if (kmsKeyId) {
  awsUploadArgs.push("--sse", "aws:kms", "--sse-kms-key-id", kmsKeyId);
} else {
  awsUploadArgs.push("--sse", "AES256");
}
aws(...awsUploadArgs);

writeFileSync(statePath, JSON.stringify(state, null, 2));

const awsStateArgs = ["s3", "cp", statePath, stateS3, "--only-show-errors"];
if (region) awsStateArgs.push("--region", region);
if (kmsKeyId) {
  awsStateArgs.push("--sse", "aws:kms", "--sse-kms-key-id", kmsKeyId);
} else {
  awsStateArgs.push("--sse", "AES256");
}
aws(...awsStateArgs);

console.log(JSON.stringify({
  ok: true,
  type: "incremental-logical-export",
  cutoff: cutoff.toISOString(),
  rows: totalRows,
  destination: outputS3,
  summary
}, null, 2));

if (process.env.BACKUP_KEEP_LOCAL !== "true") {
  rmSync(outputPath, { force: true });
  rmSync(gzipPath, { force: true });
}
