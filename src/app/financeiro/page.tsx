import { Banknote, CircleDollarSign, Filter, Landmark, Plus } from "lucide-react";
import { PrototypeAction } from "@/components/prototype-action";

const payables = [
  ["CP-4401", "Cimento CP-II | Fornecedor Alfa", "R$ 84.200", "13/05/2026", "Vence hoje"],
  ["CP-4408", "Aço CA-50 | Metal Forte", "R$ 132.900", "17/05/2026", "Programado"],
  ["CP-4412", "Manutenção ponte rolante", "R$ 18.600", "21/05/2026", "Aprovação"]
];

const receivables = [
  ["CR-2209", "Construtora Vale | Lajes", "R$ 210.000", "15/05/2026", "A receber"],
  ["CR-2217", "Obra Norte | Pilares", "R$ 146.500", "20/05/2026", "A receber"],
  ["CR-2220", "Cliente Rodovia 8 | Vigas", "R$ 392.000", "28/05/2026", "Faturar"]
];

export default function FinanceiroPage() {
  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Financeiro e compras</p>
          <h1>Fluxo de caixa operacional</h1>
          <p className="lead">
            Protótipo para unir compras, contas a pagar, contas a receber e aprovações de
            gastos ligados à produção.
          </p>
        </div>
        <div className="button-row">
          <PrototypeAction className="primary-button" message="Novo título financeiro simulado. A próxima etapa pode abrir um formulário real.">
            <Plus size={17} />
            Novo título
          </PrototypeAction>
        </div>
      </section>

      <section className="finance-grid" style={{ marginBottom: 16 }}>
        <article className="finance-tile accent-blue">
          <div className="metric-top"><span className="mono">Contas a receber</span><CircleDollarSign size={22} /></div>
          <strong className="metric-value">R$ 1,24 mi</strong>
          <span className="metric-sub">Próximos 30 dias</span>
        </article>
        <article className="finance-tile accent-orange">
          <div className="metric-top"><span className="mono">Contas a pagar</span><Banknote size={22} /></div>
          <strong className="metric-value">R$ 482 mil</strong>
          <span className="metric-sub">Compras e serviços</span>
        </article>
        <article className="finance-tile accent-gray">
          <div className="metric-top"><span className="mono">Saldo projetado</span><Landmark size={22} /></div>
          <strong className="metric-value">R$ 758 mil</strong>
          <span className="metric-sub">Fluxo positivo</span>
        </article>
      </section>

      <section className="filter-bar">
        <div className="field">
          <label>Período</label>
          <div className="input-like">Maio/2026</div>
        </div>
        <div className="field">
          <label>Centro de custo</label>
          <div className="input-like">Produção</div>
        </div>
        <div className="field">
          <label>Status</label>
          <div className="input-like">Abertos</div>
        </div>
        <div className="field">
          <label>Categoria</label>
          <div className="input-like">Todas</div>
        </div>
        <PrototypeAction className="warning-button" message="Filtros financeiros aplicados no protótipo visual.">
          <Filter size={17} />
          Filtrar
        </PrototypeAction>
      </section>

      <section className="grid-12">
        <div className="table-shell span-6">
          <div className="table-header">
            <div>
              <p className="eyebrow">Saídas</p>
              <h2>Contas a pagar</h2>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payables.map(([code, description, value, due, status]) => (
                <tr key={code}>
                  <td className="mono">{code}</td>
                  <td>{description}</td>
                  <td className="mono">{value}</td>
                  <td>{due}</td>
                  <td><span className={`badge ${status === "Vence hoje" ? "orange" : "blue"}`}>{status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-shell span-6">
          <div className="table-header">
            <div>
              <p className="eyebrow">Entradas</p>
              <h2>Contas a receber</h2>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Cliente</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {receivables.map(([code, description, value, due, status]) => (
                <tr key={code}>
                  <td className="mono">{code}</td>
                  <td>{description}</td>
                  <td className="mono">{value}</td>
                  <td>{due}</td>
                  <td><span className="badge green">{status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
