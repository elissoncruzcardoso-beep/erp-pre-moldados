import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardPlus,
  Factory,
  PackageCheck,
  Truck,
  WalletCards
} from "lucide-react";

const metrics = [
  {
    label: "Peças produzidas",
    value: "142",
    sub: "Meta do turno: 180 peças",
    icon: Factory,
    accent: "accent-blue",
    progress: 78
  },
  {
    label: "Volume concretado",
    value: "425,5 m³",
    sub: "C40 e C30 em operação",
    icon: PackageCheck,
    accent: "accent-gray",
    progress: 66
  },
  {
    label: "Estoque crítico",
    value: "7 itens",
    sub: "Cimento CP-II e aço CA-50 em atenção",
    icon: AlertTriangle,
    accent: "accent-orange",
    progress: 34
  },
  {
    label: "Fluxo 30 dias",
    value: "R$ 758 mil",
    sub: "Saldo projetado positivo",
    icon: WalletCards,
    accent: "accent-blue",
    progress: 82
  }
];

const activities = [
  ["10:42", "Qualidade", "Lote VIG-2241 aprovado", "Liberado"],
  ["10:18", "Produção", "Concretagem iniciada OP-1029", "Em curso"],
  ["09:56", "Estoque", "Baixa de aço CA-50 para OP-1027", "Baixado"],
  ["09:22", "Compras", "Pedido PC-778 aguardando aprovação", "Pendente"]
];

export default function DashboardPage() {
  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Dashboard operacional</p>
          <h1>Visão da fábrica em tempo real</h1>
          <p className="lead">
            Protótipo do painel central para acompanhar produção, estoque crítico, fluxo financeiro
            e rastreabilidade dos lotes de pré-moldados.
          </p>
        </div>
        <div className="button-row">
          <Link href="/producao" className="primary-button">
            <ClipboardPlus size={17} />
            Nova ordem
          </Link>
          <Link href="/estoque" className="secondary-button">
            <Truck size={17} />
            Ver estoque
          </Link>
        </div>
      </section>

      <section className="grid-12">
        {metrics.map((metric) => (
          <article className={`metric-card ${metric.accent} span-3`} key={metric.label}>
            <div className="metric-top">
              <span className="mono">{metric.label}</span>
              <metric.icon size={22} />
            </div>
            <strong className="metric-value">{metric.value}</strong>
            <span className="metric-sub">{metric.sub}</span>
            <div className="progress-track" aria-label={`${metric.progress}%`}>
              <div className="progress-fill" style={{ width: `${metric.progress}%` }} />
            </div>
          </article>
        ))}

        <article className="card accent-blue span-8">
          <div className="table-header" style={{ padding: 0, borderBottom: 0, marginBottom: 16 }}>
            <div>
              <p className="eyebrow">Lote ativo</p>
              <h2>OP-1029 | Pilar P-40 estrutural</h2>
            </div>
            <span className="badge blue">Concretagem</span>
          </div>
          <div className="grid-12">
            <div className="span-3">
              <span className="metric-sub">Forma</span>
              <strong className="metric-value" style={{ fontSize: 20 }}>F-304-B</strong>
            </div>
            <div className="span-3">
              <span className="metric-sub">Volume</span>
              <strong className="metric-value" style={{ fontSize: 20 }}>12,4 m³</strong>
            </div>
            <div className="span-3">
              <span className="metric-sub">Cura prevista</span>
              <strong className="metric-value" style={{ fontSize: 20 }}>18h</strong>
            </div>
            <div className="span-3">
              <span className="metric-sub">Eficiência</span>
              <strong className="metric-value" style={{ fontSize: 20 }}>94,2%</strong>
            </div>
          </div>
          <div className="progress-track" style={{ marginTop: 18 }}>
            <div className="progress-fill" style={{ width: "85%" }} />
          </div>
        </article>

        <article className="card accent-orange span-4">
          <p className="eyebrow">Alertas críticos</p>
          <div className="split-list">
            {[
              ["Cimento CP-II", "12% do mínimo", "orange"],
              ["Aço CA-50 12,5mm", "8% do mínimo", "red"],
              ["Aditivo plastificante", "24% do mínimo", "orange"]
            ].map(([item, status, tone]) => (
              <div className="split-row" key={item}>
                <div>
                  <strong>{item}</strong>
                  <div className="metric-sub">{status}</div>
                </div>
                <span className={`badge ${tone}`}>Comprar</span>
              </div>
            ))}
          </div>
        </article>

        <section className="table-shell span-8">
          <div className="table-header">
            <div>
              <p className="eyebrow">Atividades recentes</p>
              <h2>Eventos auditáveis</h2>
            </div>
            <CheckCircle2 size={22} color="#1b6b45" />
          </div>
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Módulo</th>
                <th>Evento</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {activities.map(([time, module, event, status]) => (
                <tr key={`${time}-${event}`}>
                  <td className="mono">{time}</td>
                  <td>{module}</td>
                  <td>{event}</td>
                  <td><span className="badge blue">{status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <article className="card accent-gray span-4">
          <p className="eyebrow">Próximos passos</p>
          <h2>Base pronta para evoluir</h2>
          <p className="lead">
            As telas usam dados mockados por enquanto. A próxima etapa natural é transformar
            esses blocos em componentes conectados às entidades do documento.
          </p>
          <Link href="/producao" className="secondary-button" style={{ marginTop: 14 }}>
            Abrir produção
            <ArrowRight size={16} />
          </Link>
        </article>
      </section>
    </>
  );
}
