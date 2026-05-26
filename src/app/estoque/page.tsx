import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowDownUp, ClipboardCheck, PackageSearch, ReceiptText, ScanLine } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { StockMovementForm } from "./stock-movement-form";

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

const movementLabels: Record<string, string> = {
  ENTRADA_COMPRA: "Entrada compra",
  SAIDA_PRODUCAO: "Saida producao",
  ENTRADA_PRODUCAO: "Entrada producao",
  TRANSFERENCIA: "Transferencia",
  AJUSTE_POSITIVO: "Ajuste positivo",
  AJUSTE_NEGATIVO: "Ajuste negativo",
  RESERVA: "Reserva",
  ESTORNO: "Estorno"
};

export default async function EstoquePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?next=/estoque");
  }

  if (!session.permissions.includes("estoque.view")) {
    redirect("/dashboard");
  }

  const prisma = getPrisma();
  const [items, warehouses, balances, movements, lotsCount] = await Promise.all([
    prisma.item.findMany({
      where: {
        active: true,
        controlsStock: true
      },
      include: {
        unit: true
      },
      orderBy: { code: "asc" }
    }),
    prisma.warehouse.findMany({
      where: { active: true },
      orderBy: { code: "asc" }
    }),
    prisma.stockBalance.findMany({
      include: {
        item: {
          include: {
            unit: true
          }
        },
        warehouse: true,
        lot: true
      },
      orderBy: [{ warehouse: { code: "asc" } }, { item: { code: "asc" } }]
    }),
    prisma.stockMovement.findMany({
      include: {
        item: {
          include: {
            unit: true
          }
        },
        originWarehouse: true,
        targetWarehouse: true,
        user: true
      },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.lot.count()
  ]);

  const criticalBalances = balances.filter((balance) => {
    const minimumStock = decimalToNumber(balance.item.minimumStock);
    return minimumStock > 0 && decimalToNumber(balance.quantity) <= minimumStock;
  }).length;
  const reservedTotal = balances.reduce((total, balance) => total + decimalToNumber(balance.reserved), 0);
  const stockTotal = balances.reduce((total, balance) => total + decimalToNumber(balance.quantity), 0);
  const reservedPercent = stockTotal > 0 ? Math.round((reservedTotal / stockTotal) * 100) : 0;

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Gestao de estoque</p>
          <h1>Movimentacao real de estoque</h1>
          <p className="lead">
            Tela conectada ao Supabase para registrar entradas, saidas, transferencias, reservas
            e ajustes com atualizacao de saldo e auditoria.
          </p>
        </div>
        <div className="button-row">
          <Link className="primary-button" href="/vendas">
            <ReceiptText size={16} />
            Vendas
          </Link>
          <span className="status-pill">
            <ClipboardCheck size={16} />
            Operador: {session.name}
          </span>
        </div>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <article className="metric-card accent-orange span-3">
          <div className="metric-top"><span className="mono">Itens criticos</span><PackageSearch size={22} /></div>
          <strong className="metric-value">{criticalBalances}</strong>
          <span className="metric-sub">Abaixo ou igual ao estoque minimo</span>
        </article>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Lotes rastreados</span><ScanLine size={22} /></div>
          <strong className="metric-value">{lotsCount}</strong>
          <span className="metric-sub">Materias-primas e acabados</span>
        </article>
        <article className="metric-card accent-gray span-3">
          <div className="metric-top"><span className="mono">Reservado</span><ArrowDownUp size={22} /></div>
          <strong className="metric-value">{reservedPercent}%</strong>
          <span className="metric-sub">Do saldo total movimentado</span>
        </article>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Movimentos</span><ClipboardCheck size={22} /></div>
          <strong className="metric-value">{movements.length}</strong>
          <span className="metric-sub">Ultimos registros de estoque</span>
        </article>
      </section>

      <section className="grid-12">
        <section className="table-shell span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Saldo de estoque</p>
              <h2>Materiais e produtos por deposito</h2>
            </div>
            <span className="badge blue">{warehouses.length} depositos</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Deposito</th>
                <th>Codigo</th>
                <th>Item</th>
                <th>Saldo</th>
                <th>Reservado</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((balance) => {
                const quantity = decimalToNumber(balance.quantity);
                const minimumStock = decimalToNumber(balance.item.minimumStock);
                const isCritical = minimumStock > 0 && quantity <= minimumStock;

                return (
                  <tr key={balance.id}>
                    <td>{balance.warehouse.name}</td>
                    <td className="mono">{balance.item.code}</td>
                    <td>{balance.item.description}</td>
                    <td className="mono">{formatQuantity(balance.quantity)} {balance.item.unit.code}</td>
                    <td className="mono">{formatQuantity(balance.reserved)} {balance.item.unit.code}</td>
                    <td>
                      <span className={isCritical ? "badge red" : "badge green"}>
                        {isCritical ? "Critico" : "Ok"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {balances.length === 0 ? (
                <tr>
                  <td colSpan={6}>Nenhum saldo registrado. Use o formulario para fazer a primeira entrada.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <aside className="product-side-stack span-4">
          <section className="card accent-blue product-side-panel">
            <p className="eyebrow">Novo movimento</p>
            <h2>Registrar estoque</h2>
            <StockMovementForm
              items={items.map((item) => ({
                id: item.id,
                code: item.code,
                description: item.description,
                unitCode: item.unit.code
              }))}
              warehouses={warehouses.map((warehouse) => ({
                id: warehouse.id,
                code: warehouse.code,
                name: warehouse.name
              }))}
            />
          </section>
        </aside>

        <section className="table-shell span-12">
          <div className="table-header">
            <div>
              <p className="eyebrow">Rastreabilidade</p>
              <h2>Ultimas movimentacoes</h2>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Item</th>
                <th>Qtd.</th>
                <th>Origem</th>
                <th>Destino</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td className="mono">{movement.createdAt.toLocaleString("pt-BR")}</td>
                  <td>{movementLabels[movement.type] || movement.type}</td>
                  <td>{movement.item.code} - {movement.item.description}</td>
                  <td className="mono">{formatQuantity(movement.quantity)} {movement.item.unit.code}</td>
                  <td>{movement.originWarehouse?.code || "-"}</td>
                  <td>{movement.targetWarehouse?.code || "-"}</td>
                  <td>{movement.user.name}</td>
                </tr>
              ))}
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={7}>Nenhuma movimentacao registrada ainda.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}
