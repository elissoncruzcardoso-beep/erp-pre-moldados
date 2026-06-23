export const permissions = [
  { key: "usuarios.grant_admin", module: "Usuarios", description: "Conceder ou manter perfil Administrador" },
  { key: "manutencao.cleanup", module: "Manutencao", description: "Executar limpezas destrutivas de implantacao" },
  { key: "dashboard.view", module: "Dashboard", description: "Visualizar dashboard operacional" },
  { key: "diretoria.view", module: "Diretoria", description: "Visualizar painéis executivos" },
  { key: "usuarios.manage", module: "Usuários", description: "Criar e alterar usuários e perfis" },
  { key: "cadastros.manage", module: "Cadastros", description: "Gerenciar unidades, grupos de insumos e grupos financeiros" },
  { key: "produtos.manage", module: "Produtos", description: "Criar e alterar produtos, peças e matérias-primas" },
  { key: "estoque.view", module: "Estoque", description: "Consultar saldos e lotes" },
  { key: "estoque.move", module: "Estoque", description: "Registrar movimentos de estoque" },
  { key: "estoque.adjust", module: "Estoque", description: "Registrar ajustes manuais de estoque" },
  { key: "estoque.movements.manage", module: "Estoque", description: "Editar e excluir movimentações de estoque" },
  { key: "producao.view", module: "Produção", description: "Visualizar ordens e apontamentos" },
  { key: "producao.manage", module: "Produção", description: "Criar e alterar ordens de produção" },
  { key: "producao.close", module: "Produção", description: "Encerrar ordens de produção" },
  { key: "suprimentos.view", module: "Suprimentos", description: "Visualizar solicitações, compras e contratos" },
  { key: "suprimentos.manage", module: "Suprimentos", description: "Criar e alterar processos de suprimentos" },
  { key: "financeiro.view", module: "Financeiro", description: "Visualizar financeiro básico" },
  { key: "financeiro.manage", module: "Financeiro", description: "Gerenciar contas a pagar e receber" },
  { key: "auditoria.view", module: "Auditoria", description: "Visualizar logs de auditoria" }
] as const;

export const rolePermissionMap = {
  Administrador: permissions.map((permission) => permission.key),
  Diretoria: ["dashboard.view", "diretoria.view", "producao.view", "estoque.view", "suprimentos.view", "financeiro.view", "auditoria.view"],
  Produção: ["dashboard.view", "producao.view", "producao.manage", "producao.close", "estoque.view"],
  Almoxarifado: ["dashboard.view", "estoque.view", "estoque.move", "estoque.adjust", "estoque.movements.manage", "producao.view", "cadastros.manage"],
  Suprimentos: ["dashboard.view", "suprimentos.view", "suprimentos.manage", "estoque.view", "cadastros.manage"],
  Financeiro: ["dashboard.view", "financeiro.view", "financeiro.manage", "suprimentos.view", "cadastros.manage"],
  Qualidade: ["dashboard.view", "producao.view", "estoque.view"]
} as const;

export type PermissionKey = (typeof permissions)[number]["key"];
export type RoleName = keyof typeof rolePermissionMap;
