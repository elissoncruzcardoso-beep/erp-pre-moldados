"use client";

import { useMemo, useState } from "react";
import { Eye, FileDown, Mail, X } from "lucide-react";

type ProductionReportDailyItem = {
  id: string;
  code: string;
  description: string;
  quantity: string;
  unit: string;
  note: string;
};

type ProductionReportDailyLog = {
  id: string;
  logDate: string;
  teamPresent: string;
  weatherMorning: string;
  weatherAfternoon: string;
  observation: string;
  items: ProductionReportDailyItem[];
};

type ProductionReportBatch = {
  id: string;
  code: string;
  producedAt: string;
  productId: string;
  product: string;
  producedQuantity: string;
  curingQuantity: string;
  releasedQuantity: string;
  unit: string;
  status: string;
  releasedAt: string;
  releaseResponsible: string;
  releaseNote: string;
};

type ProductionReportOrder = {
  id: string;
  number: string;
  productId: string;
  product: string;
  plannedQuantity: string;
  producedQuantity: string;
  unit: string;
  status: string;
  expectedDate: string;
  composition: string;
  activeStage: string;
};

type ProductionReportNote = {
  id: string;
  createdAt: string;
  orderNumber: string;
  productId: string;
  product: string;
  stage: string;
  producedQuantity: string;
  lossQuantity: string;
  scrapQuantity: string;
  downtimeMinutes: number;
  user: string;
  note: string;
};

type ProductionReportMovement = {
  id: string;
  createdAt: string;
  type: string;
  item: string;
  quantity: string;
  unit: string;
  warehouse: string;
  lot: string;
  document: string;
  totalCost: string;
  responsible: string;
};

type ProductionReportEvent = {
  id: string;
  date: string;
  stage: string;
  document: string;
  description: string;
  status: string;
  responsible: string;
  value: string;
};

type ProductOption = {
  id: string;
  label: string;
};

type Props = {
  generatedBy: string;
  generatedAt: string;
  dailyLogs: ProductionReportDailyLog[];
  batches: ProductionReportBatch[];
  orders: ProductionReportOrder[];
  notes: ProductionReportNote[];
  stockMovements: ProductionReportMovement[];
  timeline: ProductionReportEvent[];
  productOptions: ProductOption[];
  statusOptions: string[];
};

type SectionKey = "summary" | "daily" | "batches" | "orders" | "notes" | "stock" | "timeline";

const sectionLabels: Record<SectionKey, string> = {
  summary: "Resumo executivo",
  daily: "Diarios de producao",
  batches: "Lotes e cura",
  orders: "Ordens de producao",
  notes: "Apontamentos",
  stock: "Consumo e estoque",
  timeline: "Linha do tempo"
};

const defaultSections: Record<SectionKey, boolean> = {
  summary: true,
  daily: true,
  batches: true,
  orders: true,
  notes: true,
  stock: true,
  timeline: true
};

function parseDate(value: string) {
  return value ? new Date(value) : null;
}

function formatDate(value: string) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString("pt-BR") : "-";
}

function formatDateTime(value: string) {
  const date = parseDate(value);
  return date ? date.toLocaleString("pt-BR") : "-";
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

function toNumber(value: string) {
  return Number(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
}

export function ProductionExternalReport({
  generatedBy,
  generatedAt,
  dailyLogs,
  batches,
  orders,
  notes,
  stockMovements,
  timeline,
  productOptions,
  statusOptions
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [success, setSuccess] = useState("");
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    productId: "",
    status: "",
    responsible: "",
    document: ""
  });
  const [sections, setSections] = useState(defaultSections);

  const reportCode = useMemo(() => {
    const stamp = new Date(generatedAt).toISOString().slice(0, 10).replaceAll("-", "");
    const count = dailyLogs.length + batches.length + orders.length + notes.length + stockMovements.length;
    return `RPR-${stamp}-${String(count).padStart(4, "0")}`;
  }, [batches.length, dailyLogs.length, generatedAt, notes.length, orders.length, stockMovements.length]);

  const filtered = useMemo(() => {
    const daily = dailyLogs.filter((log) =>
      isWithinPeriod(log.logDate, filters.startDate, filters.endDate) &&
      (!filters.productId || log.items.some((item) => item.id === filters.productId)) &&
      (!filters.responsible || log.teamPresent.toLowerCase().includes(filters.responsible.toLowerCase())) &&
      (!filters.document || log.items.some((item) => item.code.toLowerCase().includes(filters.document.toLowerCase())))
    );

    const filteredBatches = batches.filter((batch) =>
      isWithinPeriod(batch.producedAt, filters.startDate, filters.endDate) &&
      (!filters.productId || batch.productId === filters.productId) &&
      (!filters.status || batch.status === filters.status) &&
      (!filters.responsible || batch.releaseResponsible.toLowerCase().includes(filters.responsible.toLowerCase())) &&
      (!filters.document || batch.code.toLowerCase().includes(filters.document.toLowerCase()))
    );

    const filteredOrders = orders.filter((order) =>
      isWithinPeriod(order.expectedDate || generatedAt, filters.startDate, filters.endDate) &&
      (!filters.productId || order.productId === filters.productId) &&
      (!filters.status || order.status === filters.status) &&
      (!filters.document || order.number.toLowerCase().includes(filters.document.toLowerCase()))
    );

    const filteredNotes = notes.filter((note) =>
      isWithinPeriod(note.createdAt, filters.startDate, filters.endDate) &&
      (!filters.productId || note.productId === filters.productId) &&
      (!filters.responsible || note.user.toLowerCase().includes(filters.responsible.toLowerCase())) &&
      (!filters.document || note.orderNumber.toLowerCase().includes(filters.document.toLowerCase()))
    );

    const filteredStock = stockMovements.filter((movement) =>
      isWithinPeriod(movement.createdAt, filters.startDate, filters.endDate) &&
      (!filters.responsible || movement.responsible.toLowerCase().includes(filters.responsible.toLowerCase())) &&
      (!filters.document || movement.document.toLowerCase().includes(filters.document.toLowerCase()))
    );

    const filteredTimeline = timeline.filter((event) =>
      isWithinPeriod(event.date, filters.startDate, filters.endDate) &&
      (!filters.status || event.status === filters.status) &&
      (!filters.responsible || event.responsible.toLowerCase().includes(filters.responsible.toLowerCase())) &&
      (!filters.document || event.document.toLowerCase().includes(filters.document.toLowerCase()))
    );

    return {
      dailyLogs: daily,
      batches: filteredBatches,
      orders: filteredOrders,
      notes: filteredNotes,
      stockMovements: filteredStock,
      timeline: filteredTimeline
    };
  }, [batches, dailyLogs, filters, generatedAt, notes, orders, stockMovements, timeline]);

  const totals = {
    dailyLogs: filtered.dailyLogs.length,
    producedDaily: filtered.dailyLogs.reduce((sum, log) => {
      return sum + log.items.reduce((itemSum, item) => itemSum + toNumber(item.quantity), 0);
    }, 0),
    curing: filtered.batches.reduce((sum, batch) => sum + toNumber(batch.curingQuantity), 0),
    ready: filtered.batches.reduce((sum, batch) => sum + toNumber(batch.releasedQuantity), 0),
    activeOrders: filtered.orders.filter((order) => !["ENCERRADA", "CANCELADA"].includes(order.status)).length,
    notes: filtered.notes.length,
    stockEvents: filtered.stockMovements.length,
    events: filtered.timeline.length
  };

  function updateFilter(name: string, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function updateSection(key: SectionKey, checked: boolean) {
    setSections((current) => ({ ...current, [key]: checked }));
  }

  function printReport() {
    setPreviewOpen(true);
    setSuccess("Relatorio de producao pronto para gerar PDF.");
    window.setTimeout(() => window.print(), 250);
  }

  function resetFilters() {
    setFilters({
      startDate: "",
      endDate: "",
      productId: "",
      status: "",
      responsible: "",
      document: ""
    });
    setSections(defaultSections);
  }

  return (
    <>
      <section className="card accent-blue report-control-card" id="relatorio-pdf">
        <div className="table-header">
          <div>
            <p className="eyebrow">Relatorio externo</p>
            <h2>Operacoes de producao em PDF</h2>
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
            <span>Produto</span>
            <select className="form-input" value={filters.productId} onChange={(event) => updateFilter("productId", event.target.value)}>
              <option value="">Todas as pecas</option>
              {productOptions.map((product) => <option key={product.id} value={product.id}>{product.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select className="form-input" value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
              <option value="">Todos</option>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Responsavel/equipe</span>
            <input className="form-input" value={filters.responsible} onChange={(event) => updateFilter("responsible", event.target.value)} placeholder="Nome do mestre ou equipe" />
          </label>
          <label className="field">
            <span>Documento</span>
            <input className="form-input mono" value={filters.document} onChange={(event) => updateFilter("document", event.target.value)} placeholder="OP, lote ou peca" />
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
            Gerar Relatorio PDF
          </button>
          <button className="secondary-button" type="button" onClick={() => setPreviewOpen(true)}>
            <Eye size={17} />
            Visualizar
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
                <h2>Relatorio externo de producao</h2>
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
            <ReportDocument code={reportCode} generatedBy={generatedBy} generatedAt={generatedAt} sections={sections} totals={totals} filtered={filtered} />
          </section>
        </div>
      ) : null}

      <div className="print-only">
        <ReportDocument code={reportCode} generatedBy={generatedBy} generatedAt={generatedAt} sections={sections} totals={totals} filtered={filtered} />
      </div>
    </>
  );
}

function ReportDocument({
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
  totals: {
    dailyLogs: number;
    producedDaily: number;
    curing: number;
    ready: number;
    activeOrders: number;
    notes: number;
    stockEvents: number;
    events: number;
  };
  filtered: {
    dailyLogs: ProductionReportDailyLog[];
    batches: ProductionReportBatch[];
    orders: ProductionReportOrder[];
    notes: ProductionReportNote[];
    stockMovements: ProductionReportMovement[];
    timeline: ProductionReportEvent[];
  };
}) {
  return (
    <article className="external-report">
      <header className="report-cover">
        <div>
          <p className="eyebrow">PRECAST ERP</p>
          <h1>Relatorio Externo de Producao</h1>
          <p>Diarios, lotes, cura, OPs, apontamentos e consumo de materiais.</p>
        </div>
        <div className="report-cover-meta">
          <strong className="mono">{code}</strong>
          <span>Emitido em {formatDateTime(generatedAt)}</span>
          <span>Responsavel: {generatedBy}</span>
        </div>
      </header>

      {sections.summary ? (
        <section className="report-section">
          <h2>Resumo executivo</h2>
          <div className="report-summary-grid">
            <span><strong>{totals.dailyLogs}</strong> diarios</span>
            <span><strong>{totals.producedDaily.toLocaleString("pt-BR")}</strong> pecas apontadas</span>
            <span><strong>{totals.curing.toLocaleString("pt-BR")}</strong> em cura</span>
            <span><strong>{totals.ready.toLocaleString("pt-BR")}</strong> aptas retirada</span>
            <span><strong>{totals.activeOrders}</strong> OPs ativas</span>
            <span><strong>{totals.stockEvents}</strong> movimentos estoque</span>
          </div>
        </section>
      ) : null}

      {sections.daily ? (
        <section className="report-section">
          <h2>Diarios de producao</h2>
          {filtered.dailyLogs.map((log) => (
            <div className="report-block" key={log.id}>
              <h3>{formatDate(log.logDate)} <span>{log.weatherMorning} / {log.weatherAfternoon}</span></h3>
              <p>Equipe: {log.teamPresent}</p>
              {log.observation ? <p>Observacao: {log.observation}</p> : null}
              <table className="report-table">
                <thead>
                  <tr><th>Item</th><th className="right">Quantidade</th><th>Obs.</th></tr>
                </thead>
                <tbody>
                  {log.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.code} - {item.description}</td>
                      <td className="right">{item.quantity} {item.unit}</td>
                      <td>{item.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ) : null}

      {sections.batches ? (
        <section className="report-section">
          <h2>Lotes, cura e retirada</h2>
          <ReportTable
            headers={["Lote", "Data", "Peca", "Produzido", "Em cura", "Liberado", "Status"]}
            rows={filtered.batches.map((batch) => [
              batch.code,
              formatDate(batch.producedAt),
              batch.product,
              `${batch.producedQuantity} ${batch.unit}`,
              `${batch.curingQuantity} ${batch.unit}`,
              `${batch.releasedQuantity} ${batch.unit}`,
              batch.status
            ])}
          />
        </section>
      ) : null}

      {sections.orders ? (
        <section className="report-section">
          <h2>Ordens de producao</h2>
          <ReportTable
            headers={["OP", "Peca", "Planejado", "Produzido", "Ficha", "Etapa", "Status"]}
            rows={filtered.orders.map((order) => [
              order.number,
              order.product,
              `${order.plannedQuantity} ${order.unit}`,
              `${order.producedQuantity} ${order.unit}`,
              order.composition || "-",
              order.activeStage || "-",
              order.status
            ])}
          />
        </section>
      ) : null}

      {sections.notes ? (
        <section className="report-section">
          <h2>Apontamentos de OP</h2>
          <ReportTable
            headers={["Data", "OP", "Peca", "Etapa", "Produzido", "Perda", "Sucata", "Usuario"]}
            rows={filtered.notes.map((note) => [
              formatDateTime(note.createdAt),
              note.orderNumber,
              note.product,
              note.stage,
              note.producedQuantity,
              note.lossQuantity,
              note.scrapQuantity,
              note.user
            ])}
          />
        </section>
      ) : null}

      {sections.stock ? (
        <section className="report-section">
          <h2>Consumo e estoque de producao</h2>
          <ReportTable
            headers={["Data", "Tipo", "Item", "Quantidade", "Deposito", "Lote", "Documento", "Custo"]}
            rows={filtered.stockMovements.map((movement) => [
              formatDateTime(movement.createdAt),
              movement.type,
              movement.item,
              `${movement.quantity} ${movement.unit}`,
              movement.warehouse,
              movement.lot || "-",
              movement.document || "-",
              movement.totalCost
            ])}
          />
        </section>
      ) : null}

      {sections.timeline ? (
        <section className="report-section">
          <h2>Linha do tempo</h2>
          <ReportTable
            headers={["Data", "Etapa", "Documento", "Descricao", "Status", "Responsavel", "Valor"]}
            rows={filtered.timeline.map((event) => [
              formatDateTime(event.date),
              event.stage,
              event.document,
              event.description,
              event.status,
              event.responsible,
              event.value
            ])}
          />
        </section>
      ) : null}

      <footer className="report-footer">
        <span>PRECAST ERP</span>
        <span>Relatorio gerado automaticamente pelo ERP.</span>
      </footer>
    </article>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table className="report-table">
      <thead>
        <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={`${row[0]}-${rowIndex}`}>
            {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell || "-"}</td>)}
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length}>Nenhum registro encontrado para os filtros selecionados.</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
