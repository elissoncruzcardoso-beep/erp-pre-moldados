import Link from "next/link";
import { ClipboardEdit, Hourglass, PackageCheck, ShieldCheck, TimerReset } from "lucide-react";
import { requirePageSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { decimalToNumber, formatQuantity } from "@/lib/formatters";
import { autoReleaseCuredBatches } from "@/lib/production/auto-release-cured-batches";
import { BatchReleaseForm } from "./batch-release-form";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  EM_CURA: "Em cura",
  APTA_RETIRADA: "Apta retirada",
  RETIRADA_PARCIAL: "Liberada parcial",
  RETIRADA_TOTAL: "Retirada total",
  BLOQUEADA: "Bloqueada"
};

function statusBadge(status: string) {
  if (status === "APTA_RETIRADA") return "badge green";
  if (status === "RETIRADA_PARCIAL") return "badge orange";
  if (status === "BLOQUEADA") return "badge red";
  return "badge blue";
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function PecasEmCuraPage({ searchParams }: PageProps) {
  const session = await requirePageSession({ nextPath: "/producao/pecas-em-cura", permission: "producao.view" });

  const prisma = getPrisma();
  if (session.permissions.includes("producao.manage")) {
    await autoReleaseCuredBatches({ userId: session.userId });
  }

  const batches = await prisma.productionBatch.findMany({
    include: {
      item: {
        include: {
          unit: true
        }
      },
      dailyLogItem: {
        include: {
          dailyLog: {
            include: {
              createdBy: true
            }
          }
        }
      },
      releasedBy: true
    },
    orderBy: [{ producedAt: "desc" }, { code: "desc" }],
    take: 60
  });

  const curingBatches = batches.filter((batch) => batch.status === "EM_CURA" || batch.status === "RETIRADA_PARCIAL");
  const readyBatches = batches.filter((batch) => batch.status === "APTA_RETIRADA");
  const params = (await searchParams) || {};
  const statusFilter = firstParam(params, "status") || "todos";
  const visibleBatches =
    statusFilter === "cura"
      ? curingBatches
      : statusFilter === "apta"
        ? readyBatches
        : batches;
  const curingQuantity = curingBatches.reduce((sum, batch) => sum + decimalToNumber(batch.curingQuantity), 0);
  const readyQuantity = readyBatches.reduce((sum, batch) => sum + decimalToNumber(batch.releasedQuantity), 0);

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Controle por lote</p>
          <h1>Peças em cura e aptas à retirada</h1>
          <p className="lead">
            Cada item lançado no Diário gera um lote em cura. Depois da conferência, o mestre libera
            o lote inteiro ou parte dele para retirada.
          </p>
        </div>
        <div className="button-row">
          <Link className={statusFilter === "todos" ? "primary-button" : "secondary-button"} href="/producao/pecas-em-cura">
            Todos
          </Link>
          <Link className={statusFilter === "cura" ? "primary-button" : "secondary-button"} href="/producao/pecas-em-cura?status=cura">
            Em cura
          </Link>
          <Link className={statusFilter === "apta" ? "primary-button" : "secondary-button"} href="/producao/pecas-em-cura?status=apta">
            Aptas
          </Link>
          <span className="status-pill">
            <ShieldCheck size={16} />
            Operador: {session.name}
          </span>
          <Link className="secondary-button" href="/producao/diario">
            <ClipboardEdit size={17} />
            Diario
          </Link>
        </div>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Lotes em cura</span><Hourglass size={22} /></div>
          <strong className="metric-value">{curingBatches.length}</strong>
          <span className="metric-sub">{formatQuantity(curingQuantity)} pecas aguardando liberacao.</span>
        </article>
        <article className="metric-card accent-orange span-3">
          <div className="metric-top"><span className="mono">Aptas retirada</span><PackageCheck size={22} /></div>
          <strong className="metric-value">{readyBatches.length}</strong>
          <span className="metric-sub">{formatQuantity(readyQuantity)} pecas ja liberadas.</span>
        </article>
        <article className="metric-card accent-gray span-3">
          <div className="metric-top"><span className="mono">Total lotes</span><TimerReset size={22} /></div>
          <strong className="metric-value">{batches.length}</strong>
          <span className="metric-sub">Historico recente de lotes gerados.</span>
        </article>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Bot</span><ClipboardEdit size={22} /></div>
          <strong className="metric-value">Lote</strong>
          <span className="metric-sub">Fluxo preparado para liberacao por mensagem.</span>
        </article>
      </section>

      <section className="table-shell">
        <div className="table-header">
          <div>
            <p className="eyebrow">Lotes de producao</p>
            <h2>Controle de cura e liberacao</h2>
          </div>
          <span className="badge blue">{visibleBatches.length} lotes</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Data</th>
              <th>Peça</th>
              <th>Produzido</th>
              <th>Em cura</th>
              <th>Liberado</th>
              <th>Apto em</th>
              <th>Status</th>
              <th>Liberar retirada</th>
            </tr>
          </thead>
          <tbody>
            {visibleBatches.map((batch) => {
              const curingQuantityValue = decimalToNumber(batch.curingQuantity);
              const canRelease = ["EM_CURA", "RETIRADA_PARCIAL"].includes(batch.status) && curingQuantityValue > 0;

              return (
                <tr key={batch.id}>
                  <td className="mono">{batch.code}</td>
                  <td className="mono">{batch.producedAt.toLocaleDateString("pt-BR")}</td>
                  <td>{batch.item.description}</td>
                  <td className="mono">{formatQuantity(batch.producedQuantity)} {batch.item.unit.code}</td>
                  <td className="mono">{formatQuantity(batch.curingQuantity)} {batch.item.unit.code}</td>
                  <td className="mono">{formatQuantity(batch.releasedQuantity)} {batch.item.unit.code}</td>
                  <td className="mono">{batch.readyAt ? batch.readyAt.toLocaleString("pt-BR") : "-"}</td>
                  <td>
                    <span className={statusBadge(batch.status)}>{statusLabels[batch.status] || batch.status}</span>
                    {batch.releaseResponsible ? (
                      <span className="product-detail">Resp.: {batch.releaseResponsible}</span>
                    ) : null}
                  </td>
                  <td>
                    {canRelease ? (
                      <BatchReleaseForm batchId={batch.id} maxQuantity={curingQuantityValue} />
                    ) : (
                      <span className="metric-sub">Sem saldo em cura</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleBatches.length === 0 ? (
              <tr>
                <td colSpan={9}>Nenhum lote gerado ainda. Salve um Diario de Producao para criar lotes em cura.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <article className="card accent-orange" style={{ marginTop: 16 }}>
        <p className="eyebrow">Mensagem futura para bot</p>
        <h2>Liberar por lote</h2>
        <pre className="bot-message-preview">{`Liberar lote:
LOTE-20260521-001
Quantidade: 10
Responsavel: Jose
Observacao: pecas conferidas, sem trinca`}</pre>
      </article>
    </>
  );
}
