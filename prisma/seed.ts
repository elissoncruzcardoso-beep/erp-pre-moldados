import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { permissions, rolePermissionMap } from "../src/lib/permissions/permissions";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL nao configurada.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000
  })
});

async function main() {
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: permission,
      create: permission
    });
  }

  for (const [roleName, rolePermissions] of Object.entries(rolePermissionMap)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { description: `Perfil ${roleName}` },
      create: { name: roleName, description: `Perfil ${roleName}` }
    });

    const permissionRows = await prisma.permission.findMany({
      where: { key: { in: [...rolePermissions] } }
    });

    for (const permission of permissionRows) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id }
      });
    }
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "Administrador" } });
  await prisma.user.upsert({
    where: { email: "admin@erp.local" },
    update: { roleId: adminRole.id, status: "ACTIVE" },
    create: {
      name: "Administrador ERP",
      email: "admin@erp.local",
      roleId: adminRole.id,
      department: "Administração"
    }
  });

  const [un, kg, m3, litro] = await Promise.all([
    prisma.unitOfMeasure.upsert({ where: { code: "UN" }, update: {}, create: { code: "UN", name: "Unidade", decimals: 0 } }),
    prisma.unitOfMeasure.upsert({ where: { code: "KG" }, update: {}, create: { code: "KG", name: "Quilograma", decimals: 3 } }),
    prisma.unitOfMeasure.upsert({ where: { code: "M3" }, update: {}, create: { code: "M3", name: "Metro cúbico", decimals: 3 } }),
    prisma.unitOfMeasure.upsert({ where: { code: "L" }, update: {}, create: { code: "L", name: "Litro", decimals: 3 } })
  ]);

  await prisma.warehouse.upsert({
    where: { code: "MP" },
    update: {},
    create: { code: "MP", name: "Matéria-prima", type: "Almoxarifado" }
  });
  await prisma.warehouse.upsert({
    where: { code: "PA" },
    update: {},
    create: { code: "PA", name: "Produto acabado", type: "Estoque" }
  });

  const financialSeed = [
    { code: "FIN-VENDAS", name: "Venda de peças pré-moldadas", type: "ENTRADA", category: "Receita operacional", costCenter: "Comercial" },
    { code: "FIN-MP", name: "Compra de matéria-prima", type: "SAIDA", category: "Produção", costCenter: "Fábrica" },
    { code: "FIN-INS", name: "Compra de insumos", type: "SAIDA", category: "Produção", costCenter: "Fábrica" },
    { code: "FIN-MANUT", name: "Manutenção de equipamentos", type: "SAIDA", category: "Manutenção", costCenter: "Fábrica" },
    { code: "FIN-MO", name: "Mão de obra", type: "SAIDA", category: "Produção", costCenter: "Fábrica" }
  ] as const;

  for (const group of financialSeed) {
    await prisma.financialGroup.upsert({
      where: { code: group.code },
      update: {
        name: group.name,
        type: group.type,
        category: group.category,
        costCenter: group.costCenter,
        active: true
      },
      create: {
        code: group.code,
        name: group.name,
        type: group.type,
        category: group.category,
        costCenter: group.costCenter
      }
    });
  }

  const paymentMethodSeed = [
    { code: "PIX", name: "Pix", type: "PIX", note: "Recebimento ou pagamento instantaneo." },
    { code: "DINHEIRO", name: "Dinheiro", type: "DINHEIRO", note: "Pagamento em especie." },
    { code: "CARTAO", name: "Cartao", type: "CARTAO", note: "Credito ou debito." },
    { code: "BOLETO", name: "Boleto bancario", type: "BOLETO", note: "Pagamento a prazo por boleto." },
    { code: "TRANSFERENCIA", name: "Transferencia bancaria", type: "TRANSFERENCIA", note: "TED, DOC ou transferencia entre contas." }
  ] as const;

  for (const method of paymentMethodSeed) {
    await prisma.paymentMethod.upsert({
      where: { code: method.code },
      update: {
        name: method.name,
        type: method.type,
        active: true,
        note: method.note
      },
      create: method
    });
  }

  const settlementTypeSeed = [
    { code: "REC-VENDA", name: "Recebimento de venda", direction: "ENTRADA", note: "Baixa de conta a receber originada por venda." },
    { code: "REC-PIX", name: "Recebimento via Pix", direction: "ENTRADA", note: "Baixa imediata por Pix." },
    { code: "PAG-FORN", name: "Pagamento de fornecedor", direction: "SAIDA", note: "Baixa de conta a pagar." },
    { code: "ESTORNO", name: "Estorno financeiro", direction: "ESTORNO", note: "Cancelamento ou ajuste de baixa financeira." }
  ] as const;

  for (const type of settlementTypeSeed) {
    await prisma.financialSettlementType.upsert({
      where: { code: type.code },
      update: {
        name: type.name,
        direction: type.direction,
        active: true,
        note: type.note
      },
      create: type
    });
  }

  const financialMp = await prisma.financialGroup.findUniqueOrThrow({ where: { code: "FIN-MP" } });
  const financialIns = await prisma.financialGroup.findUniqueOrThrow({ where: { code: "FIN-INS" } });
  const inputGroupSeed = [
    { code: "GRP-CIM", name: "Cimento", type: "MATERIA_PRIMA", defaultFinancialGroupId: financialMp.id, note: "CP-II, CP-V e similares." },
    { code: "GRP-AGR", name: "Agregados", type: "MATERIA_PRIMA", defaultFinancialGroupId: financialMp.id, note: "Areia, brita e pó de pedra." },
    { code: "GRP-ACO", name: "Aço e armaduras", type: "MATERIA_PRIMA", defaultFinancialGroupId: financialMp.id, note: "CA-50, estribos e telas." },
    { code: "GRP-ADT", name: "Aditivos", type: "INSUMO", defaultFinancialGroupId: financialIns.id, note: "Plastificantes e impermeabilizantes." },
    { code: "GRP-EPI", name: "EPIs e consumo", type: "INSUMO", defaultFinancialGroupId: financialIns.id, note: "Itens de consumo operacional." }
  ] as const;

  for (const group of inputGroupSeed) {
    await prisma.inputGroup.upsert({
      where: { code: group.code },
      update: {
        name: group.name,
        type: group.type,
        defaultFinancialGroupId: group.defaultFinancialGroupId,
        controlsStock: true,
        active: true,
        note: group.note
      },
      create: {
        code: group.code,
        name: group.name,
        type: group.type,
        defaultFinancialGroupId: group.defaultFinancialGroupId,
        controlsStock: true,
        note: group.note
      }
    });
  }

  await prisma.customer.upsert({
    where: { code: "CLI-001" },
    update: {},
    create: {
      code: "CLI-001",
      name: "Construtora Vale",
      document: "00.000.000/0001-11",
      email: "financeiro@construtoravale.example",
      phone: "(41) 3000-2001"
    }
  });

  await prisma.customer.upsert({
    where: { code: "CLI-002" },
    update: {},
    create: {
      code: "CLI-002",
      name: "Obra Norte Engenharia",
      document: "00.000.000/0001-12",
      email: "contas@obranorte.example",
      phone: "(41) 3000-2002"
    }
  });

  await prisma.customer.upsert({
    where: { code: "CLI-003" },
    update: {},
    create: {
      code: "CLI-003",
      name: "Rodovia 8 Infraestrutura",
      document: "00.000.000/0001-13",
      email: "adm@rodovia8.example",
      phone: "(41) 3000-2003"
    }
  });

  await prisma.supplier.upsert({
    where: { code: "FOR-001" },
    update: {},
    create: {
      code: "FOR-001",
      name: "Concreto Sul Materiais",
      document: "00.000.000/0001-01",
      email: "compras@concretosul.example",
      phone: "(41) 3000-1001"
    }
  });

  await prisma.supplier.upsert({
    where: { code: "FOR-002" },
    update: {},
    create: {
      code: "FOR-002",
      name: "Aco Forte Distribuidora",
      document: "00.000.000/0001-02",
      email: "vendas@acoforte.example",
      phone: "(41) 3000-1002"
    }
  });

  await prisma.supplier.upsert({
    where: { code: "FOR-003" },
    update: {},
    create: {
      code: "FOR-003",
      name: "Tecno Aditivos Industriais",
      document: "00.000.000/0001-03",
      email: "comercial@tecnoaditivos.example",
      phone: "(41) 3000-1003"
    }
  });

  const cimento = await prisma.item.upsert({
    where: { code: "MP-001" },
    update: {},
    create: {
      code: "MP-001",
      description: "Cimento CP-II",
      type: "MATERIA_PRIMA",
      group: "Cimento",
      unitId: kg.id,
      controlsLot: true,
      minimumStock: 12000,
      standardCost: 0.72
    }
  });

  const aco = await prisma.item.upsert({
    where: { code: "MP-014" },
    update: {},
    create: {
      code: "MP-014",
      description: "Aço CA-50 12,5mm",
      type: "MATERIA_PRIMA",
      group: "Armadura",
      unitId: kg.id,
      controlsLot: true,
      minimumStock: 2500,
      standardCost: 6.4
    }
  });

  const aditivo = await prisma.item.upsert({
    where: { code: "AD-004" },
    update: {},
    create: {
      code: "AD-004",
      description: "Aditivo plastificante",
      type: "INSUMO",
      group: "Aditivos",
      unitId: litro.id,
      controlsLot: true,
      minimumStock: 300,
      standardCost: 14.8
    }
  });

  await prisma.item.upsert({
    where: { code: "CONC-C40" },
    update: {},
    create: {
      code: "CONC-C40",
      description: "Concreto C40",
      type: "INSUMO",
      group: "Concreto",
      unitId: m3.id,
      controlsLot: false,
      minimumStock: 0,
      standardCost: 420
    }
  });

  const precastProducts = [
    ["PM-D80-INF", "MANILHA PRE-MOLDADA INFERIOR D=80 CM X ALT 50 CM", "Manilhas D80", 0, 0, 24],
    ["PM-D80-MED", "MANILHA PRE-MOLDADA MEDIAL D=80 CM X ALT 50 CM", "Manilhas D80", 0, 0, 24],
    ["PM-D80-SUP", "MANILHA PRE-MOLDADA SUPERIOR D=80 CM X ALT 50 CM", "Manilhas D80", 0, 0, 24],
    ["PM-D80", "MANILHA PRE-MOLDADA D=80 X ALT=50 CM", "Manilhas D80", 0, 0, 24],
    ["TP-D80", "TAMPA PRE-MOLDADA D=80 X ESP=5 CM", "Tampas D80", 0, 0, 24],
    ["PIL-520-20", "PILAR PRE-MOLDADO ALT=5,20 M X ESP=20 CM", "Pilares", 0, 0, 48],
    ["LAJ-D200-20", "LAJE PRE-MOLDADA D=2,0 M X ESP=20 CM", "Lajes", 0, 0, 48],
    ["MOU-10-220", "MOURAO RETO 10 X 10 X 2,20 M", "Mouroes", 0, 0, 24],
    ["PM-D205", "MANILHAO PRE-MOLDADA D=205 CM X ALT=50 CM", "Manilhoes D205", 0, 0, 48],
    ["TP-D205", "TAMPA PRE-MOLDADA D=205 CM X ESP=10 CM", "Tampas D205", 0, 0, 48]
  ] as const;

  for (const [code, description, group, minimumStock, standardCost, curingHours] of precastProducts) {
    await prisma.item.upsert({
      where: { code },
      update: {
        description,
        type: "PECA_PRE_MOLDADA",
        group,
        unitId: un.id,
        controlsStock: true,
        controlsLot: true,
        minimumStock,
        standardCost,
        curingHours,
        active: true
      },
      create: {
        code,
        description,
        type: "PECA_PRE_MOLDADA",
        group,
        unitId: un.id,
        controlsStock: true,
        controlsLot: true,
        minimumStock,
        standardCost,
        curingHours
      }
    });
  }

  const pilar = await prisma.item.findUniqueOrThrow({ where: { code: "PIL-520-20" } });
  const composition = await prisma.composition.upsert({
    where: { code: "COMP-PIL-520-20" },
    update: {
      productId: pilar.id,
      version: "1",
      revision: "A",
      baseQuantity: 1,
      expectedLoss: 0,
      curingHours: 48,
      approved: false
    },
    create: {
      code: "COMP-PIL-520-20",
      productId: pilar.id,
      version: "1",
      revision: "A",
      baseQuantity: 1,
      expectedLoss: 0,
      curingHours: 48,
      approved: false
    }
  });

  const compositionItems = [
    { itemId: cimento.id, quantity: 55, stage: "Concreto" },
    { itemId: aco.id, quantity: 18, stage: "Armadura" },
    { itemId: aditivo.id, quantity: 0.8, stage: "Concreto" }
  ];

  for (const item of compositionItems) {
    const existing = await prisma.compositionItem.findFirst({
      where: {
        compositionId: composition.id,
        itemId: item.itemId
      }
    });

    if (existing) {
      await prisma.compositionItem.update({
        where: { id: existing.id },
        data: {
          quantity: item.quantity,
          stage: item.stage
        }
      });
    } else {
      await prisma.compositionItem.create({
        data: {
          compositionId: composition.id,
          itemId: item.itemId,
          quantity: item.quantity,
          stage: item.stage
        }
      });
    }
  }

  await prisma.mold.upsert({
    where: { code: "F-304-B" },
    update: {},
    create: { code: "F-304-B", name: "Forma Pilar P-40", capacity: 4 }
  });

  console.log("Seed inicial do ERP Pré-Moldados concluído.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
