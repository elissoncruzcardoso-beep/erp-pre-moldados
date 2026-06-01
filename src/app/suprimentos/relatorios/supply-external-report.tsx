"use client";

import { memo, useMemo, useState } from "react";
import { Eye, FileDown, Mail, X } from "lucide-react";

type ReportItem = {
  id: string;
  code: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice?: string;
  total?: string;
  note?: string;
};

type ReportRequest = {
  id: string;
  number: string;
  createdAt: string;
  requester: string;
  status: string;
  priority: string;
  department: string;
  costCenter: string;
  neededAt: string;
  justification: string;
  items: ReportItem[];
};

type ReportQuote = {
  id: string;
  number: string;
  requestId: string;
  requestNumber: string;
  supplierId: string;
  supplier: string;
  createdAt: string;
  status: string;
  deliveryDays: string;
  paymentTerms: string;
  freightCost: string;
  totalValue: string;
  note: string;
  hasOrder: boolean;
  items: ReportItem[];
};

type ReportOrder = {
  id: string;
  number: string;
  quoteNumber: string;
  requestId: string;
  requestNumber: string;
  supplierId: string;
  supplier: string;
  createdAt: string;
  issuedAt: string;
  expectedDeliveryAt: string;
  responsible: string;
  status: string;
  paymentTerms: string;
  freightCost: string;
  totalValue: string;
  note: string;
  items: ReportItem[];
};

type ReportReceipt = {
  id: string;
  number: string;
  invoiceNumber: string;
  orderNumber: string;
  supplierId: string;
  supplier: string;
  item: string;
  receivedAt: string;
  createdAt: string;
  warehouse: string;
  lot: string;
  receivedQuantity: string;
  acceptedQuantity: string;
  unit: string;
  status: string;
  responsible: string;
  totalCost: string;
  note: string;
};

type ReportMovement = {
  id: string;
  createdAt: string;
  type: string;
  item: string;
  quantity: string;
  unit: string;
  warehouse: string;
  lot: string;
  document: string;
  supplier: string;
  totalCost: string;
  responsible: string;
};

type ReportEvent = {
  id: string;
  date: string;
  stage: string;
  document: string;
  description: string;
  status: string;
  responsible: string;
  value: string;
};

type Props = {
  generatedBy: string;
  generatedAt: string;
  requests: ReportRequest[];
  quotes: ReportQuote[];
  orders: ReportOrder[];
  receipts: ReportReceipt[];
  stockMovements: ReportMovement[];
  timeline: ReportEvent[];
  supplierOptions: { id: string; name: string }[];
  requestOptions: { id: string; number: string }[];
  orderOptions: { id: string; number: string }[];
  statusOptions: string[];
};

type SectionKey = "requests" | "quotes" | "orders" | "receipts" | "stock" | "timeline";

const sectionLabels: Record<SectionKey, string> = {
  requests: "Solicitacoes",
  quotes: "Mapa de cotacao",
  orders: "Pedidos",
  receipts: "Notas fiscais",
  stock: "Entradas de estoque",
  timeline: "Linha do tempo"
};

const defaultSections: Record<SectionKey, boolean> = {
  requests: true,
  quotes: true,
  orders: true,
  receipts: true,
  stock: true,
  timeline: true
};

function parseDate(value: string) {
  return value ? new Date(value) : null;
}

function isWithinPeriod(dateValue: string, start: string, end: string) {
  const date = parseDate(dateValue);
  if (!date) return true;

  if (start) {
    const startDate = new Date(`${start}T00:00:00`);
    if (date < startDate) return false;
  }

  if (end) {
    const endDate = new Date(`${end}T23:59:59`);
    if (date > endDate) return false;
  }

  return true;
}

function formatDateTime(value: string) {
  const date = parseDate(value);
  return date ? date.toLocaleString("pt-BR") : "-";
}

function formatDate(value: string) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString("pt-BR") : "-";
}

export function SupplyExternalReport({
  generatedBy,
  generatedAt,
  requests,
  quotes,
  orders,
  receipts,
  stockMovements,
  timeline,
  supplierOptions,
  requestOptions,
  orderOptions,
  statusOptions
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [success, setSuccess] = useState("");
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    requestId: "",
    supplierId: "",
    orderId: "",
    invoiceNumber: "",
    status: "",
    responsible: ""
  });
  const [sections, setSections] = useState(defaultSections);

  const reportCode = useMemo(() => {
    const stamp = new Date(generatedAt).toISOString().slice(0, 10).replaceAll("-", "");
    return `RSP-${stamp}-${String(requests.length + quotes.length + orders.length + receipts.length).padStart(4, "0")}`;
  }, [generatedAt, orders.length, quotes.length, receipts.length, requests.length]);

  const filtered = useMemo(() => {
    const filteredRequests = requests.filter((request) =>
      isWithinPeriod(request.createdAt, filters.startDate, filters.endDate) &&
      (!filters.requestId || request.id === filters.requestId) &&
      (!filters.status || request.status === filters.status) &&
      (!filters.responsible || request.requester.toLowerCase().includes(filters.responsible.toLowerCase()))
    );

    const allowedRequestIds = new Set(filteredRequests.map((request) => request.id));

    const filteredQuotes = quotes.filter((quote) =>
      isWithinPeriod(quote.createdAt, filters.startDate, filters.endDate) &&
      (!filters.requestId || quote.requestId === filters.requestId) &&
      (!filters.supplierId || quote.supplierId === filters.supplierId) &&
      (!filters.status || quote.status === filters.status) &&
      (!filters.responsible || quote.supplier.toLowerCase().includes(filters.responsible.toLowerCase())) &&
      (!filters.requestId || allowedRequestIds.has(quote.requestId))
    );

    const filteredOrders = orders.filter((order) =>
      isWithinPeriod(order.createdAt, filters.startDate, filters.endDate) &&
      (!filters.requestId || order.requestId === filters.requestId) &&
      (!filters.supplierId || order.supplierId === filters.supplierId) &&
      (!filters.orderId || order.id === filters.orderId) &&
      (!filters.status || order.status === filters.status) &&
      (!filters.responsible || order.responsible.toLowerCase().includes(filters.responsible.toLowerCase()))
    );

    const allowedOrderNumbers = new Set(filteredOrders.map((order) => order.number));

    const filteredReceipts = receipts.filter((receipt) =>
      isWithinPeriod(receipt.createdAt, filters.startDate, filters.endDate) &&
      (!filters.supplierId || receipt.supplierId === filters.supplierId) &&
      (!filters.orderId || allowedOrderNumbers.has(receipt.orderNumber)) &&
      (!filters.invoiceNumber || receipt.invoiceNumber.toLowerCase().includes(filters.invoiceNumber.toLowerCase())) &&
      (!filters.status || receipt.status === filters.status) &&
      (!filters.responsible || receipt.responsible.toLowerCase().includes(filters.responsible.toLowerCase()))
    );

    const allowedDocuments = new Set(filteredReceipts.map((receipt) => receipt.invoiceNumber || receipt.number));

    const filteredStock = stockMovements.filter((movement) =>
      isWithinPeriod(movement.createdAt, filters.startDate, filters.endDate) &&
      (!filters.supplierId || movement.supplier === supplierOptions.find((supplier) => supplier.id === filters.supplierId)?.name) &&
      (!filters.orderId || movement.document.includes([...allowedOrderNumbers][0] || "")) &&
      (!filters.invoiceNumber || movement.document.toLowerCase().includes(filters.invoiceNumber.toLowerCase())) &&
      (!filters.responsible || movement.responsible.toLowerCase().includes(filters.responsible.toLowerCase()))
    );

    const filteredTimeline = timeline.filter((event) =>
      isWithinPeriod(event.date, filters.startDate, filters.endDate) &&
      (!filters.status || event.status === filters.status) &&
      (!filters.responsible || event.responsible.toLowerCase().includes(filters.responsible.toLowerCase())) &&
      (!filters.invoiceNumber || event.document.toLowerCase().includes(filters.invoiceNumber.toLowerCase()) || allowedDocuments.has(event.document))
    );

    return {
      requests: filteredRequests,
      quotes: filteredQuotes,
      orders: filteredOrders,
      receipts: filteredReceipts,
      stockMovements: filteredStock,
      timeline: filteredTimeline
    };
  }, [filters, orders, quotes, receipts, requests, stockMovements, supplierOptions, timeline]);

  const totals = useMemo(() => ({
    requests: filtered.requests.length,
    quoted: filtered.quotes.reduce((sum, quote) => sum + Number(quote.totalValue.replace(/[^\d,-]/g, "").replace(",", ".")), 0),
    approved: filtered.quotes.filter((quote) => quote.status === "APROVADA").length,
    orders: filtered.orders.length,
    receipts: filtered.receipts.length,
    stock: filtered.stockMovements.length,
    events: filtered.timeline.length
  }), [filtered]);

  function updateFilter(name: string, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function updateSection(key: SectionKey, checked: boolean) {
    setSections((current) => ({ ...current, [key]: checked }));
  }

  function printReport() {
    setPreviewOpen(true);
    setSuccess("Relatorio pronto para gerar PDF.");
    window.setTimeout(() => window.print(), 250);
  }

  function resetFilters() {
    setFilters({
      startDate: "",
      endDate: "",
      requestId: "",
      supplierId: "",
      orderId: "",
      invoiceNumber: "",
      status: "",
      responsible: ""
    });
    setSections(defaultSections);
  }

  return (
    <>
      <section className="card accent-blue report-control-card">
        <div className="table-header">
          <div>
            <p className="eyebrow">Relatorio externo</p>
            <h2>Operacoes de suprimentos em PDF</h2>
            <p className="metric-sub">Filtre, revise as secoes e gere um PDF profissional pela impressao do navegador.</p>
          </div>
          <span className="badge blue">{reportCode}</span>
        </div>

        <div className="report-filter-grid">
          <label className="field">
            <span>Inicio</span>
            <input className="form-input mono" type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} />
          </label>
          <label className="field">
            <span>Fim</span>
            <input className="form-input mono" type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} />
          </label>
          <label className="field">
            <span>Solicitacao</span>
            <select className="form-input" value={filters.requestId} onChange={(event) => updateFilter("requestId", event.target.value)}>
              <option value="">Todas</option>
              {requestOptions.map((request) => <option key={request.id} value={request.id}>{request.number}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Fornecedor</span>
            <select className="form-input" value={filters.supplierId} onChange={(event) => updateFilter("supplierId", event.target.value)}>
              <option value="">Todos</option>
              {supplierOptions.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Pedido</span>
            <select className="form-input" value={filters.orderId} onChange={(event) => updateFilter("orderId", event.target.value)}>
              <option value="">Todos</option>
              {orderOptions.map((order) => <option key={order.id} value={order.id}>{order.number}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Nota fiscal</span>
            <input className="form-input mono" value={filters.invoiceNumber} onChange={(event) => updateFilter("invoiceNumber", event.target.value)} placeholder="NF-000123" />
          </label>
          <label className="field">
            <span>Status</span>
            <select className="form-input" value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
              <option value="">Todos</option>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Responsavel</span>
            <input className="form-input" value={filters.responsible} onChange={(event) => updateFilter("responsible", event.target.value)} placeholder="Nome ou fornecedor" />
          </label>
        </div>

        <div className="report-section-picker">
          {(Object.keys(sectionLabels) as SectionKey[]).map((key) => (
            <label key={key}>
              <input type="checkbox" checked={sections[key]} onChange={(event) => updateSection(key, event.target.checked)} />
              {sectionLabels[key]}
            </label>
          ))}
        </div>

        <div className="button-row">
          <button className="primary-button" type="button" onClick={printReport}>
            <FileDown size={17} />
            Gerar Relatorio Externo PDF
          </button>
          <button className="secondary-button" type="button" onClick={() => setPreviewOpen(true)}>
            <Eye size={17} />
            Visualizar Relatorio
          </button>
          <button className="secondary-button" type="button" onClick={() => setSuccess("Envio por e-mail sera conectado ao cadastro de destinatarios na proxima etapa.")}>
            <Mail size={17} />
            Enviar por e-mail
          </button>
          <button className="secondary-button" type="button" onClick={resetFilters}>
            Limpar filtros
          </button>
        </div>
        {success ? <p className="auth-success">{success}</p> : null}
      </section>

      {previewOpen ? (
        <div className="report-preview-overlay">
          <section className="report-preview-modal">
            <div className="report-preview-toolbar">
              <div>
                <p className="eyebrow">Pre-visualizacao</p>
                <h2>Relatorio externo de suprimentos</h2>
              </div>
              <div className="button-row">
                <button className="primary-button mini-button" type="button" onClick={printReport}>
                  <FileDown size={15} />
                  PDF
                </button>
                <button className="secondary-button mini-button" type="button" onClick={() => setPreviewOpen(false)}>
                  <X size={15} />
                  Fechar
                </button>
              </div>
            </div>
            <ReportDocument
              code={reportCode}
              generatedBy={generatedBy}
              generatedAt={generatedAt}
              sections={sections}
              totals={totals}
              filtered={filtered}
            />
          </section>
        </div>
      ) : null}

    </>
  );
}

const ReportDocument = memo(function ReportDocument({
  code,
  generatedBy,
  generatedAt,
  sections,
  totals,
  filtered
}: {
  code: string;
  generatedBy: string;
  generatedAt: string;
  sections: Record<SectionKey, boolean>;
  totals: { requests: number; quoted: number; approved: number; orders: number; receipts: number; stock: number; events: number };
  filtered: {
    requests: ReportRequest[];
    quotes: ReportQuote[];
    orders: ReportOrder[];
    receipts: ReportReceipt[];
    stockMovements: ReportMovement[];
    timeline: ReportEvent[];
  };
}) {
  return (
    <article className="external-report">
      <header className="report-cover">
        <div>
          <p className="eyebrow">PRECAST ERP</p>
          <h1>Relatorio Externo de Operacoes de Suprimentos</h1>
          <p>Relatorio gerado automaticamente pelo ERP.</p>
        </div>
        <div className="report-cover-meta">
          <strong className="mono">{code}</strong>
          <span>Emitido em {formatDateTime(generatedAt)}</span>
          <span>Responsavel: {generatedBy}</span>
        </div>
      </header>

      <section className="report-section">
        <h2>Resumo executivo</h2>
        <div className="report-summary-grid">
          <span><strong>{totals.requests}</strong> solicitacoes</span>
          <span><strong>{totals.approved}</strong> cotacoes aprovadas</span>
          <span><strong>{totals.orders}</strong> pedidos</span>
          <span><strong>{totals.receipts}</strong> notas/recebimentos</span>
          <span><strong>{totals.stock}</strong> entradas estoque</span>
          <span><strong>{totals.events}</strong> eventos rastreados</span>
        </div>
      </section>

      {sections.requests ? (
        <section className="report-section">
          <h2>Solicitacoes de compra</h2>
          {filtered.requests.map((request) => (
            <div className="report-block" key={request.id}>
              <h3>{request.number} <span>{request.status}</span></h3>
              <p>Data: {formatDateTime(request.createdAt)} | Responsavel: {request.requester} | Prioridade: {request.priority}</p>
              <p>Departamento: {request.department || "-"} | Centro de custo: {request.costCenter || "-"} | Necessario: {formatDate(request.neededAt)}</p>
              <ReportItemsTable items={request.items} />
            </div>
          ))}
        </section>
      ) : null}

      {sections.quotes ? (
        <section className="report-section">
          <h2>Mapa comparativo de cotacao</h2>
          {filtered.quotes.map((quote) => (
            <div className="report-block" key={quote.id}>
              <h3>{quote.number} <span>{quote.status}</span></h3>
              <p>Solicitacao: {quote.requestNumber} | Fornecedor: {quote.supplier} | Prazo: {quote.deliveryDays || "-"} dias</p>
              <p>Frete: {quote.freightCost} | Total: {quote.totalValue} | Pedido gerado: {quote.hasOrder ? "Sim" : "Nao"}</p>
              <ReportItemsTable items={quote.items} showPrices />
            </div>
          ))}
        </section>
      ) : null}

      {sections.orders ? (
        <section className="report-section">
          <h2>Pedidos de compra</h2>
          {filtered.orders.map((order) => (
            <div className="report-block" key={order.id}>
              <h3>{order.number} <span>{order.status}</span></h3>
              <p>Fornecedor: {order.supplier} | Cotacao: {order.quoteNumber} | Responsavel: {order.responsible}</p>
              <p>Emissao: {formatDate(order.issuedAt)} | Entrega: {formatDate(order.expectedDeliveryAt)} | Total: {order.totalValue}</p>
              <ReportItemsTable items={order.items} showPrices />
            </div>
          ))}
        </section>
      ) : null}

      {sections.receipts ? (
        <section className="report-section">
          <h2>Notas fiscais e recebimentos</h2>
          <table className="report-table">
            <thead>
              <tr><th>NF</th><th>Pedido</th><th>Fornecedor</th><th>Item</th><th>Aceito</th><th>Status</th><th>Valor</th></tr>
            </thead>
            <tbody>
              {filtered.receipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td>{receipt.invoiceNumber || receipt.number}</td>
                  <td>{receipt.orderNumber}</td>
                  <td>{receipt.supplier}</td>
                  <td>{receipt.item}</td>
                  <td>{receipt.acceptedQuantity} {receipt.unit}</td>
                  <td>{receipt.status}</td>
                  <td className="right">{receipt.totalCost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {sections.stock ? (
        <section className="report-section">
          <h2>Movimentacoes de estoque</h2>
          <table className="report-table">
            <thead>
              <tr><th>Data</th><th>Tipo</th><th>Item</th><th>Qtd.</th><th>Deposito</th><th>Lote</th><th>Documento</th><th>Custo</th></tr>
            </thead>
            <tbody>
              {filtered.stockMovements.map((movement) => (
                <tr key={movement.id}>
                  <td>{formatDateTime(movement.createdAt)}</td>
                  <td>{movement.type}</td>
                  <td>{movement.item}</td>
                  <td>{movement.quantity} {movement.unit}</td>
                  <td>{movement.warehouse}</td>
                  <td>{movement.lot}</td>
                  <td>{movement.document}</td>
                  <td className="right">{movement.totalCost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {sections.timeline ? (
        <section className="report-section">
          <h2>Linha do tempo das operacoes</h2>
          <table className="report-table">
            <thead>
              <tr><th>Data</th><th>Etapa</th><th>Documento</th><th>Descricao</th><th>Status</th><th>Valor</th><th>Resp.</th></tr>
            </thead>
            <tbody>
              {filtered.timeline.map((event) => (
                <tr key={event.id}>
                  <td>{formatDateTime(event.date)}</td>
                  <td>{event.stage}</td>
                  <td>{event.document}</td>
                  <td>{event.description}</td>
                  <td>{event.status}</td>
                  <td className="right">{event.value}</td>
                  <td>{event.responsible}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <footer className="report-footer">
        <span>PRECAST ERP</span>
        <span>Relatorio gerado automaticamente pelo ERP.</span>
        <span>{formatDateTime(generatedAt)}</span>
      </footer>
    </article>
  );
});

const ReportItemsTable = memo(function ReportItemsTable({ items, showPrices = false }: { items: ReportItem[]; showPrices?: boolean }) {
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qtd.</th>
          <th>Un.</th>
          {showPrices ? <th>Valor unit.</th> : null}
          {showPrices ? <th>Total</th> : null}
          <th>Obs.</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>{item.code} - {item.description}</td>
            <td>{item.quantity}</td>
            <td>{item.unit}</td>
            {showPrices ? <td className="right">{item.unitPrice || "-"}</td> : null}
            {showPrices ? <td className="right">{item.total || "-"}</td> : null}
            <td>{item.note || "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});
