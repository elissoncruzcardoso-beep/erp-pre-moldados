import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  ChartNoAxesCombined,
  ClipboardCheck,
  Factory,
  FileText,
  PackageSearch,
  ShieldCheck,
  WalletCards
} from "lucide-react";

const modules = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: ChartNoAxesCombined,
    status: "Visão executiva",
    description: "Indicadores de produção, estoque crítico, fluxo financeiro e eventos recentes."
  },
  {
    title: "Produção",
    href: "/producao",
    icon: Factory,
    status: "Protótipo operacional",
    description: "Ordens por etapa, formas/moldes, apontamentos simulados e relatórios de produção."
  },
  {
    title: "Suprimentos",
    href: "/suprimentos",
    icon: PackageSearch,
    status: "Novo módulo",
    description: "Ambientes de compras, contratos/medições e estoque, seguindo a estrutura solicitada."
  },
  {
    title: "Estoque",
    href: "/estoque",
    icon: Boxes,
    status: "Protótipo operacional",
    description: "Saldos, lotes, rastreabilidade, reservas, inventário e itens críticos."
  },
  {
    title: "Financeiro",
    href: "/financeiro",
    icon: WalletCards,
    status: "Protótipo gerencial",
    description: "Contas a pagar/receber, fluxo de caixa e visão financeira sem compras duplicadas."
  }
];

const agenda = [
  "Validar se os módulos representam o processo real da fábrica.",
  "Listar campos obrigatórios por tela antes de criar backend.",
  "Definir níveis de permissão por perfil de usuário.",
  "Priorizar o MVP: produção, estoque, suprimentos e financeiro básico.",
  "Mapear melhorias sugeridas pela diretoria e responsáveis por decisão."
];

const roadmap = [
  ["Fase 1", "Validar protótipo", "Diretoria e gestores aprovam navegação, módulos e nomes."],
  ["Fase 2", "Desenhar formulários", "Criar telas de cadastro, entrada, aprovação e consulta."],
  ["Fase 3", "Backend e banco", "Implementar dados reais, autenticação, permissões e auditoria."],
  ["Fase 4", "Implantação piloto", "Rodar com produção/estoque em ambiente controlado."],
  ["Fase 5", "Evolução", "Relatórios avançados, fiscal, BI e integrações."]
];

export default function DiretoriaPage() {
  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Análise executiva</p>
          <h1>ERP de pré-moldados para avaliação da diretoria</h1>
          <p className="lead">
            Página preparada para apresentar o protótipo, coletar ideias de melhoria e organizar
            a implantação por fases antes de investir no backend e nas integrações.
          </p>
        </div>
        <div className="button-row">
          <Link className="primary-button" href="/dashboard">
            Abrir protótipo
            <ArrowRight size={17} />
          </Link>
          <Link className="secondary-button" href="/producao/relatorios">
            Relatórios produção
            <FileText size={17} />
          </Link>
        </div>
      </section>

      <section className="grid-12" style={{ marginBottom: 16 }}>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Módulos visuais</span><ClipboardCheck size={22} /></div>
          <strong className="metric-value">5</strong>
          <span className="metric-sub">Dashboard, produção, suprimentos, estoque e financeiro</span>
        </article>
        <article className="metric-card accent-orange span-3">
          <div className="metric-top"><span className="mono">Funcionalidades</span><Factory size={22} /></div>
          <strong className="metric-value">Protótipo</strong>
          <span className="metric-sub">Sem backend, ideal para validar fluxo e layout</span>
        </article>
        <article className="metric-card accent-gray span-3">
          <div className="metric-top"><span className="mono">Segurança</span><ShieldCheck size={22} /></div>
          <strong className="metric-value">Planejada</strong>
          <span className="metric-sub">Permissões, auditoria e rastreabilidade previstas</span>
        </article>
        <article className="metric-card accent-blue span-3">
          <div className="metric-top"><span className="mono">Próxima decisão</span><ChartNoAxesCombined size={22} /></div>
          <strong className="metric-value">MVP</strong>
          <span className="metric-sub">Escolher o que entra primeiro em produção</span>
        </article>
      </section>

      <section className="director-module-grid">
        {modules.map((module) => (
          <Link className="card accent-blue director-module-card" href={module.href} key={module.title}>
            <div className="metric-top">
              <module.icon size={24} color="#1a237e" />
              <span className="badge blue">{module.status}</span>
            </div>
            <h2>{module.title}</h2>
            <p>{module.description}</p>
            <span className="director-card-link">Abrir módulo <ArrowRight size={15} /></span>
          </Link>
        ))}
      </section>

      <section className="grid-12" style={{ marginTop: 16 }}>
        <article className="card accent-orange span-5">
          <p className="eyebrow">Roteiro de reunião</p>
          <h2>Pontos para análise</h2>
          <div className="director-checklist">
            {agenda.map((item) => (
              <div className="split-row" key={item}>
                <ClipboardCheck size={18} color="#1a237e" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>

        <section className="table-shell span-7">
          <div className="table-header">
            <div>
              <p className="eyebrow">Implantação</p>
              <h2>Roadmap sugerido</h2>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Fase</th>
                <th>Objetivo</th>
                <th>Resultado esperado</th>
              </tr>
            </thead>
            <tbody>
              {roadmap.map(([phase, goal, result]) => (
                <tr key={phase}>
                  <td className="mono">{phase}</td>
                  <td>{goal}</td>
                  <td>{result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}
