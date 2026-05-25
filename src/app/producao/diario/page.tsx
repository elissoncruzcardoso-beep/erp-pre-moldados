import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, CalendarDays, CloudSun, Factory, PackageCheck, ShieldCheck, Users } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { ProductionDailyLogForm } from "./production-daily-log-form";

export const dynamic = "force-dynamic";

function decimalToNumber(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString());
  }

  return Number(value ?? 0);
}

function formatQuantity(value: unknown) {
  return decimalToNumber(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 3
  });
}

export default async function DiarioProducaoPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/producao/diario");
  }

  if (!session.permissions.includes("producao.view")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  const [products, dailyLogs] = await Promise.all([
    prisma.item.findMany({
      where: {
        active: true,
        type: { in: ["PECA_PRE_MOLDADA", "PRODUTO_ACABADO"] }
      },
      include: {
        unit: true,
        compositionsAsProduct: {
          where: {
            approved: true
          },
          orderBy: {
            updatedAt: "desc"
          },
          take: 1
        }
      },
      orderBy: [{ group: "asc" }, { code: "asc" }]
    }),
    prisma.productionDailyLog.findMany({
      include: {
        createdBy: true,
        items: {
          include: {
            item: {
              include: {
                unit: true
              }
            }
          }
        }
      },
      orderBy: { logDate: "desc" },
      take: 20
    })
  ]);

  const totalProduced = dailyLogs.reduce((sum, log) => {
    return sum + log.items.reduce((itemSum, item) => itemSum + decimalToNumber(item.quantity), 0);
  }, 0);
  const lastLog = dailyLogs[0];
  const lastTeamCount = lastLog
    ? lastLog.teamPresent.split(/,|\n/).map((name) => name.trim()).filter(Boolean).length
    : 0;

  return (
    <>
      <section className="page-head daily-hero-panel">
        <div>
          <p className="eyebrow">Chao de fabrica</p>
          <h1>Diario de Producao</h1>
          <p className="lead">
            Registro simples para equipe presente, clima, pecas produzidas e observacoes do dia.
            Esta tela sera a base do futuro bot via WhatsApp ou Telegram.
          </p>
        </div>
        <div className="button-row">
          <span className="status-pill">
            <ShieldCheck size={16} />
            Operador: {session.name}
          </span>
          <Link className="secondary-button" href="/producao">
            <Factory size={17} />
            Producao
          </Link>
          <Link className="primary-button" href="/producao/pecas-em-cura">
            <PackageCheck size={17} />
            Pecas em cura
          </Link>
        </div>
      </section>

      <section className="daily-metric-grid">
        <article className="metric-card accent-blue">
          <div className="metric-top"><span className="mono">Diarios</span><CalendarDays size={22} /></div>
          <strong className="metric-value">{dailyLogs.length}</strong>
          <span className="metric-sub">Ultimos registros de producao diaria.</span>
        </article>
        <article className="metric-card accent-orange">
          <div className="metric-top"><span className="mono">Equipe ultimo dia</span><Users size={22} /></div>
          <strong className="metric-value">{lastTeamCount}</strong>
          <span className="metric-sub">Trabalhadores informados no ultimo diario.</span>
        </article>
        <article className="metric-card accent-gray">
          <div className="metric-top"><span className="mono">Pecas apontadas</span><Factory size={22} /></div>
          <strong className="metric-value">{formatQuantity(totalProduced)}</strong>
          <span className="metric-sub">Quantidade somada nos diarios listados.</span>
        </article>
        <article className="metric-card accent-blue">
          <div className="metric-top"><span className="mono">Bot futuro</span><Bot size={22} /></div>
          <strong className="metric-value">IA</strong>
          <span className="metric-sub">Formato pronto para mensagens estruturadas.</span>
        </article>
      </section>

      <section className="daily-workspace">
        <section className="card accent-blue daily-form-card">
          <div className="daily-card-head">
            <div>
              <p className="eyebrow">Novo diario</p>
              <h2>Registrar dia de producao</h2>
            </div>
            <span className="badge blue">Chao de fabrica</span>
          </div>
          <ProductionDailyLogForm
            products={products.map((product) => ({
              id: product.id,
              label: `${product.code} - ${product.description} (${product.unit.code})`,
              hasApprovedComposition: product.compositionsAsProduct.length > 0,
              compositionCode: product.compositionsAsProduct[0]?.code || null
            }))}
          />
        </section>

        <section className="table-shell daily-history-card">
          <div className="table-header">
            <div>
              <p className="eyebrow">Historico</p>
              <h2>Registros recentes</h2>
            </div>
            <CloudSun size={22} color="#1a237e" />
          </div>
          <div className="daily-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Clima</th>
                  <th>Equipe</th>
                  <th>Itens</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {dailyLogs.map((log) => {
                  const teamCount = log.teamPresent.split(/,|\n/).map((name) => name.trim()).filter(Boolean).length;
                  const produced = log.items.reduce((sum, item) => sum + decimalToNumber(item.quantity), 0);

                  return (
                    <tr key={log.id}>
                      <td className="mono">{log.logDate.toLocaleDateString("pt-BR")}</td>
                      <td>{log.weatherMorning} / {log.weatherAfternoon}</td>
                      <td className="mono">{teamCount}</td>
                      <td>
                        {log.items.map((item) => (
                          <span className="daily-item-pill" key={item.id}>
                            {item.item.code}: {formatQuantity(item.quantity)} {item.item.unit.code}
                          </span>
                        ))}
                      </td>
                      <td className="mono">{formatQuantity(produced)}</td>
                    </tr>
                  );
                })}
                {dailyLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Nenhum diario de producao registrado ainda.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <article className="card accent-orange daily-bot-card">
          <div className="daily-card-head">
            <div>
              <p className="eyebrow">Formato para o bot</p>
              <h2>Mensagem que o mestre podera enviar</h2>
            </div>
            <span className="badge orange">Parser local</span>
          </div>
          <pre className="bot-message-preview">{`Equipe:
Joao, Carlos, Pedro

Clima:
Manha sol
Tarde chuva

Producao:
MANILHA D80 INFERIOR: 12
TAMPA D80: 8
MOURAO RETO: 20

Observacao:
Faltou areia no fim da tarde.`}</pre>
        </article>
      </section>
    </>
  );
}
