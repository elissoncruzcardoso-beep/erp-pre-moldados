import { PrismaClient } from "@prisma/client";
import { permissions, rolePermissionMap } from "../src/lib/permissions/permissions";

const prisma = new PrismaClient();

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

  await prisma.item.upsert({
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

  await prisma.item.upsert({
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

  await prisma.item.upsert({
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
    where: { code: "PA-109" },
    update: {},
    create: {
      code: "PA-109",
      description: "Pilar P-40 estrutural",
      type: "PECA_PRE_MOLDADA",
      group: "Pilares",
      unitId: un.id,
      controlsLot: true,
      minimumStock: 5,
      standardCost: 1280
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
