import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Boxes,
  CalendarDays,
  Factory,
  FileDown,
  Filter,
  Gauge,
  Hammer,
  PackageCheck,
  TimerReset
} from "lucide-react";
import { PrototypeAction } from "@/components/prototype-action";

const reportCards = [
  {
    title: "Produção por período",
    value: "1.284 peças",
    sub: "Maio/2026 | 425,5 m³ concretados",
    icon: Factory,
    accent: "accent-blue"
  },
  {
    title: "Eficiência média",
    value: "94,2%",
    sub: "Turno A acima da meta operacional",
    icon: Gauge,
    accent: "accent-blue"
  },
  {
    title: "Perdas e refugos",
    value: "3,8%",
    sub: "Meta máxima definida: 4,5%",
    icon: AlertTriangle,
    accent: "accent-orange"
  },
  {
    title: "Ordens atrasadas",
    value: "6 OPs",
    sub: "Principal causa: cura e inspeção",
    icon: TimerReset,
    accent: "accent-gray"
  }
];

const reportEnvironments = [
  {
    title: "Produtividade",
    description: "Resumo por turno, equipe, peça e volume concretado.",
    icon: BarChart3,
    items: ["Produção diária", "Produção por equipe", "Volume por traço", "Peças liberadas"]
  },
  {
    title: "Ordens de Produção",
    description: "Acompanhamento de status, atrasos, prioridades e encerramentos.",
    icon: Factory,
    items: ["OPs abertas", "OPs em atraso", "OPs encerradas", "Fila por etapa"]
  },
  {
    title: "Consumo e Custo",
    description: "Comparativo entre composição prevista e consumo realizado.",
    icon: Boxes,
    items: ["Previsto x realizado", "Consumo por lote", "Custo por OP", "Desvio de material"]
  },
  {
    title: "Qualidade e Perdas",
    description: "Indicadores de refugo, retrabalho, bloqueio e não conformidade.",
    icon: PackageCheck,
    items: ["Refugos", "Retrabalhos", "Lotes bloqueados", "Não conformidades"]
  },
  {
    title: "Formas e Moldes",
    description: "Utilização, disponibilidade e gargalos por recurso produtivo.",
    icon: Hammer,
    items: ["Uso por forma", "Ociosidade", "Liberação prevista", "Gargalos"]
  }
];

const productionRows = [
  ["OP-1029", "Pilar P-40 estrutural", "Concretagem", "12,4 m³", "85%", "No prazo"],
  ["OP-1027", "Viga V-12 ponte", "Preparação", "18,8 m³", "75%", "No prazo"],
  ["OP-1018", "Laje alveolar LA-6", "Cura", "32,0 m³", "68%", "Atenção"],
  ["OP-1014", "Bloco canaleta", "Qualidade", "8,6 m³", "100%", "Liberar"],
  ["OP-1037", "Escada E-02", "Armação", "6,2 m³", "41%", "Atrasada"]
];

const varianceRows = [
  ["Cimento CP-II", "42.000 kg", "43.180 kg", "+2,8%", "Atenção"],
  ["Aço CA-50", "8.400 kg", "8.220 kg", "-2,1%", "Ok"],
  ["Brita 1", "78.000 kg", "77.400 kg", "-0,8%", "Ok"],
  ["Aditivo plastificante", "620 L", "664 L", "+7,1%", "Revisar"]
];

export default function ProducaoRelatoriosPage() {
  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Relatórios de produção</p>
          <h1>Indicadores industriais e acompanhamento de OPs</h1>
          <p className="lead">
            Ambientes visuais para relatórios do módulo Produção: produtividade, ordens,
            consumo, perdas, qualidade e utilização de formas. Os dados ainda são simulados.
          </p>
        </div>
        <div className="button-row">
          <Link className="secondary-button" href="/producao">
            <ArrowLeft size={17} />
            Voltar produção
          </Link>
          <PrototypeAction
            className="primary-button"
            message="Exportação simulada. Futuramente este botão poderá gerar PDF, Excel ou relatório configurável."
          >
            <FileDown size={17} />
            Exportar
          </PrototypeAction>
        </div>
      </section>

      <section className="filter-bar">
        <div className="field">
          <label>Período</label>
          <div className="input-like">Maio/2026</div>
        </div>
        <div className="field">
          <label>Turno</label>
          <div className="input-like">Todos</div>
        </div>
        <div className="field">
          <label>Produto</label>
          <div className="input-like">Todas as peças</div>
        </div>
        <div className="field">
          <label>Status OP</label>
          <div className="input-like">Todos</div>
        </div>
        <PrototypeAction className="warning-button" message="Filtros de relatórios aplicados no protótipo visual.">
          <Filter size={17} />
          Filtrar
        </PrototypeAction>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        {reportCards.map((card) => (
          <article className={`metric-card ${card.accent} span-3`} key={card.title}>
            <div className="metric-top">
              <span className="mono">{card.title}</span>
              <card.icon size={22} />
            </div>
            <strong className="metric-value">{card.value}</strong>
            <span className="metric-sub">{card.sub}</span>
          </article>
        ))}
      </section>

      <section className="report-environment-grid">
        {reportEnvironments.map((report) => (
          <article className="card accent-blue report-card" key={report.title}>
            <div className="metric-top">
              <div>
                <p className="eyebrow">{report.title}</p>
                <h2>{report.description}</h2>
              </div>
              <report.icon size={26} color="#1a237e" />
            </div>
            <div className="report-chip-list">
              {report.items.map((item) => (
                <PrototypeAction
                  key={item}
                  className="report-chip"
                  message={`${item}: relatório visual criado. Próxima etapa: filtros, colunas e exportação real.`}
                >
                  {item}
                </PrototypeAction>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid-12" style={{ marginTop: 16 }}>
        <div className="table-shell span-7">
          <div className="table-header">
            <div>
              <p className="eyebrow">Ordens por status</p>
              <h2>Mapa operacional das OPs</h2>
            </div>
            <CalendarDays size={22} color="#1a237e" />
          </div>
          <table>
            <thead>
              <tr>
                <th>OP</th>
                <th>Peça</th>
                <th>Etapa</th>
                <th>Volume</th>
                <th>Avanço</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {productionRows.map(([op, piece, stage, volume, progress, status]) => (
                <tr key={op}>
                  <td className="mono">{op}</td>
                  <td>{piece}</td>
                  <td>{stage}</td>
                  <td className="mono">{volume}</td>
                  <td className="mono">{progress}</td>
                  <td>
                    <span className={`badge ${status === "Atrasada" ? "red" : status === "Atenção" ? "orange" : "green"}`}>
                      {status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-shell span-5">
          <div className="table-header">
            <div>
              <p className="eyebrow">Consumo</p>
              <h2>Previsto x realizado</h2>
            </div>
            <Boxes size={22} color="#1a237e" />
          </div>
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Previsto</th>
                <th>Realizado</th>
                <th>Desvio</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {varianceRows.map(([material, planned, actual, variance, status]) => (
                <tr key={material}>
                  <td>{material}</td>
                  <td className="mono">{planned}</td>
                  <td className="mono">{actual}</td>
                  <td className="mono">{variance}</td>
                  <td>
                    <span className={`badge ${status === "Ok" ? "green" : status === "Atenção" ? "orange" : "red"}`}>
                      {status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
