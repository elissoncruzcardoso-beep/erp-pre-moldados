import Link from "next/link";
import { ArrowDownUp, ClipboardCheck, PackageSearch, ReceiptText, ScanLine } from "lucide-react";
import { requirePageSession } from "@/lib/auth/guards";
import { PaginationControls } from "@/components/pagination-controls";
import { getPrisma } from "@/lib/db/prisma";
import { decimalToNumber, formatQuantity } from "@/lib/formatters";
import { getPaginationMeta, parsePagination, type SearchParamsLike } from "@/lib/pagination";
import { FORM_OPTION_LIMIT, STOCK_BALANCE_LIMIT } from "@/lib/query-limits";
import { StockMovementForm } from "./stock-movement-form";
import { StockMovementActions } from "./stock-movement-actions";

export const dynamic = "force-dynamic";

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

function firstParam(params: SearchParamsLike, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

type EstoquePageProps = {
  searchParams?: Promise<SearchParamsLike>;
};

export default async function EstoquePage({ searchParams }: EstoquePageProps) {
  const session = await requirePageSession({ nextPath: "/estoque", permission: "estoque.view" });

  const prisma = getPrisma();
  const params = (await searchParams) || {};
  const balancePagination = parsePagination(params, {
    pageParam: "saldosPage",
    defaultPageSize: 12,
    maxPageSize: 60
  });
  const movementPagination = parsePagination(params, {
    pageParam: "movimentosPage",
    defaultPageSize: 12,
    maxPageSize: 60
  });
  const balanceStatus = firstParam(params, "saldoStatus") || "COM_SALDO";
  const balanceWarehouseId = firstParam(params, "depositoId") || "";
  const balanceType = firstParam(params, "tipoItem") || "";
  const balanceSearch = (firstParam(params, "qSaldo") || "").trim().toLowerCase();

  const [items, warehouses, balances, movements, movementsCount, lotsCount] = await Promise.all([
    prisma.item.findMany({
      where: {
        active: true,
        controlsStock: true
      },
      include: {
        unit: true
      },
      orderBy: { code: "asc" },
      take: FORM_OPTION_LIMIT
    }),
    prisma.warehouse.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      take: FORM_OPTION_LIMIT
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
      orderBy: [{ warehouse: { code: "asc" } }, { item: { code: "asc" } }],
      take: STOCK_BALANCE_LIMIT
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
        user: true,
        directSale: true,
        purchaseReceipt: true
      },
      orderBy: { createdAt: "desc" },
      skip: movementPagination.skip,
      take: movementPagination.pageSize
    }),
    prisma.stockMovement.count(),
    prisma.lot.count()
  ]);

  const balanceMap = new Map<string, {
    id: string;
    itemId: string;
    warehouseId: string;
    quantity: number;
    reserved: number;
    lotCount: number;
    item: (typeof balances)[number]["item"];
    warehouse: (typeof balances)[number]["warehouse"];
  }>();

  balances.forEach((balance) => {
    const key = `${balance.itemId}:${balance.warehouseId}`;
    const current = balanceMap.get(key);

    if (current) {
      current.quantity += decimalToNumber(balance.quantity);
      current.reserved += decimalToNumber(balance.reserved);
      current.lotCount += balance.lotId ? 1 : 0;
      return;
    }

    balanceMap.set(key, {
      id: key,
      itemId: balance.itemId,
      warehouseId: balance.warehouseId,
      quantity: decimalToNumber(balance.quantity),
      reserved: decimalToNumber(balance.reserved),
      lotCount: balance.lotId ? 1 : 0,
      item: balance.item,
      warehouse: balance.warehouse
    });
  });

  const consolidatedBalances = Array.from(balanceMap.values()).sort((a, b) => {
    const warehouseCompare = a.warehouse.code.localeCompare(b.warehouse.code);
    return warehouseCompare || a.item.code.localeCompare(b.item.code);
  });
  const filteredBalances = consolidatedBalances.filter((balance) => {
    const available = balance.quantity - balance.reserved;
    const minimumStock = decimalToNumber(balance.item.minimumStock);
    const statusMatches =
      balanceStatus === "TODOS" ||
      (balanceStatus === "COM_SALDO" && available > 0) ||
      (balanceStatus === "SEM_SALDO" && available <= 0) ||
      (balanceStatus === "CRITICO" && minimumStock > 0 && available > 0 && available <= minimumStock) ||
      (balanceStatus === "RESERVADO" && balance.reserved > 0);
    const warehouseMatches = !balanceWarehouseId || balance.warehouseId === balanceWarehouseId;
    const typeMatches = !balanceType || balance.item.type === balanceType;
    const searchMatches =
      !balanceSearch ||
      balance.item.code.toLowerCase().includes(balanceSearch) ||
      balance.item.description.toLowerCase().includes(balanceSearch) ||
      balance.warehouse.name.toLowerCase().includes(balanceSearch);

    return statusMatches && warehouseMatches && typeMatches && searchMatches;
  });
  const criticalBalances = consolidatedBalances.filter((balance) => {
    const minimumStock = decimalToNumber(balance.item.minimumStock);
    const available = balance.quantity - balance.reserved;
    return minimumStock > 0 && available <= minimumStock;
  }).length;
  const reservedTotal = consolidatedBalances.reduce((total, balance) => total + balance.reserved, 0);
  const stockTotal = consolidatedBalances.reduce((total, balance) => total + balance.quantity, 0);
  const reservedPercent = stockTotal > 0 ? Math.round((reservedTotal / stockTotal) * 100) : 0;
  const balancePaginationMeta = getPaginationMeta(filteredBalances.length, balancePagination.page, balancePagination.pageSize);
  const movementPaginationMeta = getPaginationMeta(movementsCount, movementPagination.page, movementPagination.pageSize);
  const paginatedBalances = filteredBalances.slice(
    (balancePaginationMeta.page - 1) * balancePaginationMeta.pageSize,
    balancePaginationMeta.page * balancePaginationMeta.pageSize
  );
  const itemOptions = items.map((item) => ({
    id: item.id,
    code: item.code,
    description: item.description,
    unitCode: item.unit.code
  }));
  const warehouseOptions = warehouses.map((warehouse) => ({
    id: warehouse.id,
    code: warehouse.code,
    name: warehouse.name
  }));
  const canManageStockMovements =
    session.permissions.includes("estoque.movements.manage") ||
    ["Administrador", "Diretoria"].includes(session.role);

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
          <strong className="metric-value">{movementsCount}</strong>
          <span className="metric-sub">Registros de estoque</span>
        </article>
      </section>

      <section className="grid-12">
        <section className="table-shell span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Saldo de estoque</p>
              <h2>Materiais e produtos por deposito</h2>
            </div>
            <span className="badge blue">{filteredBalances.length} saldo(s)</span>
          </div>
          <form className="stock-filter-panel" method="get">
            <input type="hidden" name="movimentosPage" value={String(movementPagination.page)} />
            <input type="hidden" name="pageSize" value={String(balancePagination.pageSize)} />
            <div className="stock-filter-fields">
              <label className="field">
                <span>Status</span>
                <select className="form-input" name="saldoStatus" defaultValue={balanceStatus}>
                  <option value="COM_SALDO">Somente com saldo disponivel</option>
                  <option value="SEM_SALDO">Sem saldo disponivel</option>
                  <option value="CRITICO">Criticos</option>
                  <option value="RESERVADO">Com reserva</option>
                  <option value="TODOS">Todos</option>
                </select>
              </label>
              <label className="field">
                <span>Deposito</span>
                <select className="form-input" name="depositoId" defaultValue={balanceWarehouseId}>
                  <option value="">Todos</option>
                  {warehouses.map((warehouse) => (
                    <option value={warehouse.id} key={warehouse.id}>
                      {warehouse.code} - {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Tipo</span>
                <select className="form-input" name="tipoItem" defaultValue={balanceType}>
                  <option value="">Todos</option>
                  <option value="MATERIA_PRIMA">Materia-prima</option>
                  <option value="INSUMO">Insumo</option>
                  <option value="PRODUTO_ACABADO">Produto acabado</option>
                  <option value="PECA_PRE_MOLDADA">Peca pre-moldada</option>
                  <option value="FORMA_MOLDE">Forma/molde</option>
                  <option value="SERVICO">Servico</option>
                </select>
              </label>
              <label className="field stock-filter-search">
                <span>Buscar</span>
                <input className="form-input" name="qSaldo" defaultValue={firstParam(params, "qSaldo") || ""} placeholder="Codigo, item ou deposito" />
              </label>
            </div>
            <div className="stock-filter-actions">
              <Link className="secondary-button" href="/estoque">
                Limpar
              </Link>
              <button className="primary-button" type="submit">
                Filtrar
              </button>
            </div>
          </form>
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
              {paginatedBalances.map((balance) => {
                const minimumStock = decimalToNumber(balance.item.minimumStock);
                const available = balance.quantity - balance.reserved;
                const isCritical = minimumStock > 0 && available > 0 && available <= minimumStock;
                const isOutOfStock = available <= 0;
                const isFullyReserved = balance.quantity > 0 && available <= 0 && balance.reserved > 0;

                return (
                  <tr key={balance.id}>
                    <td>{balance.warehouse.name}</td>
                    <td className="mono">{balance.item.code}</td>
                    <td>
                      <strong>{balance.item.description}</strong>
                      {balance.lotCount > 0 ? <small className="product-detail">{balance.lotCount} lote(s) consolidados</small> : null}
                    </td>
                    <td className="mono">{formatQuantity(available)} {balance.item.unit.code}</td>
                    <td className="mono">{formatQuantity(balance.reserved)} {balance.item.unit.code}</td>
                    <td>
                      <span className={isOutOfStock ? "badge orange" : isCritical ? "badge red" : "badge green"}>
                        {isFullyReserved ? "Reservado" : isOutOfStock ? "Sem saldo" : isCritical ? "Critico" : "Ok"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {paginatedBalances.length === 0 ? (
                <tr>
                  <td colSpan={6}>Nenhum saldo registrado. Use o formulario para fazer a primeira entrada.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <PaginationControls
            pathname="/estoque"
            params={params}
            meta={balancePaginationMeta}
            pageParam="saldosPage"
          />
        </section>

        <aside className="product-side-stack span-4">
          <section className="card accent-blue product-side-panel">
            <p className="eyebrow">Novo movimento</p>
            <h2>Registrar estoque</h2>
            <StockMovementForm
              items={itemOptions}
              warehouses={warehouseOptions}
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
                <th>Acoes</th>
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
                  <td>
                    <StockMovementActions
                      movement={{
                        id: movement.id,
                        type: movement.type,
                        itemId: movement.itemId,
                        quantity: movement.quantity.toString(),
                        unitCost: movement.unitCost.toString(),
                        originWarehouseId: movement.originWarehouseId || "",
                        targetWarehouseId: movement.targetWarehouseId || "",
                        document: movement.document || "",
                        justification: movement.justification || "",
                        locked: Boolean(movement.directSale || movement.purchaseReceipt || movement.productionOrderId)
                      }}
                      items={itemOptions}
                      warehouses={warehouseOptions}
                      canManageMovements={canManageStockMovements}
                    />
                  </td>
                </tr>
              ))}
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={8}>Nenhuma movimentacao registrada ainda.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <PaginationControls
            pathname="/estoque"
            params={params}
            meta={movementPaginationMeta}
            pageParam="movimentosPage"
          />
        </section>
      </section>
    </>
  );
}
