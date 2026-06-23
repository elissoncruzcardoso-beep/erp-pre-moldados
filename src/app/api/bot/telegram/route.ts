import { AuditAction, type Item } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess, apiUnauthorized, apiValidationError, handleApiError } from "@/lib/api/responses";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import {
  buildProductionBatchCode,
  makeDecimal,
  parseProductionDailyMessage
} from "@/lib/bot/production-daily-parser";
import { calculateBatchReadyAt } from "@/lib/production/auto-release-cured-batches";
import { FORM_OPTION_LIMIT } from "@/lib/query-limits";

const telegramUpdateSchema = z.object({
  message: z.object({
    chat: z.object({
      id: z.union([z.number(), z.string().trim().min(1).max(80)]).optional()
    }).passthrough().optional(),
    from: z.object({
      id: z.number().int().positive().optional(),
      first_name: z.string().trim().max(80).optional(),
      username: z.string().trim().max(80).optional()
    }).passthrough().optional(),
    text: z.string().trim().max(4096).optional()
  }).passthrough().optional()
}).passthrough();

async function sendTelegramMessage(chatId: string | number | undefined, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !chatId) {
    return;
  }

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  }).catch(() => null);
}

function assertTelegramSecret(request: Request) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!configuredSecret && process.env.NODE_ENV === "production") {
    return false;
  }

  if (!configuredSecret) {
    return true;
  }

  return request.headers.get("x-telegram-bot-api-secret-token") === configuredSecret;
}

export async function POST(request: Request) {
  if (!assertTelegramSecret(request)) {
    return apiUnauthorized("Webhook nao autorizado.");
  }

  const body = await request.json().catch(() => null);
  const parsedUpdate = telegramUpdateSchema.safeParse(body);

  if (!parsedUpdate.success) {
    return apiValidationError("Payload do Telegram invalido.", parsedUpdate.error.flatten());
  }

  const update = parsedUpdate.data;
  const message = update?.message;
  const text = message?.text;
  const chatId = message?.chat?.id;
  const logContext = {
    request,
    module: "Bot Telegram",
    action: "registrar_diario",
    entity: "ProductionDailyLog"
  };

  if (!text) {
    return apiSuccess({ ignored: true });
  }

  const prisma = getPrisma();
  const botUserEmail = process.env.TELEGRAM_BOT_USER_EMAIL || "admin@erp.local";
  const botUser = await prisma.user.findUnique({ where: { email: botUserEmail } });

  if (!botUser || botUser.status !== "ACTIVE") {
    const reply = "Nao encontrei um usuario ativo para registrar o diario no ERP.";
    await sendTelegramMessage(chatId, reply);
    return apiError(reply, { status: 400 });
  }

  let products: Item[];
  let approvedCompositions: Array<{ productId: string; curingHours: number | null }>;

  try {
    products = await prisma.item.findMany({
      where: {
        active: true,
        type: { in: ["PECA_PRE_MOLDADA", "PRODUTO_ACABADO"] }
      },
      orderBy: { code: "asc" },
      take: FORM_OPTION_LIMIT
    });
    approvedCompositions = await prisma.composition.findMany({
      where: {
        productId: { in: products.map((product) => product.id) },
        approved: true
      },
      select: {
        productId: true,
        curingHours: true,
        updatedAt: true,
        code: true
      },
      orderBy: [{ updatedAt: "desc" }, { code: "asc" }],
      take: FORM_OPTION_LIMIT * 3
    });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel carregar dados para o bot.", {
      context: {
        ...logContext,
        request,
        userId: botUser.id
      },
      event: "telegram_bootstrap_error"
    });
  }

  const compositionsByProductId = new Map<string, { curingHours: number | null }>();

  for (const composition of approvedCompositions) {
    if (!compositionsByProductId.has(composition.productId)) {
      compositionsByProductId.set(composition.productId, composition);
    }
  }

  const parsed = parseProductionDailyMessage(text, products);

  if (parsed.items.length === 0) {
    const reply = [
      "Nao consegui identificar nenhum item produzido.",
      "Use o formato:",
      "Diario 22/05",
      "Equipe: Joao, Pedro",
      "Manha: Sol",
      "Tarde: Chuva",
      "Producao:",
      "Tampa D80: 8"
    ].join("\n");
    await sendTelegramMessage(chatId, reply);
    return apiError("Nenhum item reconhecido.", { status: 400, details: { unmatchedItems: parsed.unmatchedItems } });
  }

  let result;

  try {
    result = await serializableTransaction(prisma, async (tx) => {
      const existingBatches = await tx.productionBatch.count({
        where: { producedAt: parsed.logDate }
      });
      const log = await tx.productionDailyLog.upsert({
        where: {
          logDate_createdById: {
            logDate: parsed.logDate,
            createdById: botUser.id
          }
        },
        update: {
          teamPresent: parsed.teamPresent,
          weatherMorning: parsed.weatherMorning,
          weatherAfternoon: parsed.weatherAfternoon,
          observation: parsed.observation || `Atualizado via Telegram por ${message?.from?.first_name || message?.from?.username || "mestre"}.`
        },
        create: {
          logDate: parsed.logDate,
          teamPresent: parsed.teamPresent,
          weatherMorning: parsed.weatherMorning,
          weatherAfternoon: parsed.weatherAfternoon,
          observation: parsed.observation || `Registrado via Telegram por ${message?.from?.first_name || message?.from?.username || "mestre"}.`,
          createdById: botUser.id
        }
      });
      const createdItems = [];

      for (const [index, item] of parsed.items.entries()) {
        const logItem = await tx.productionDailyLogItem.create({
          data: {
            dailyLogId: log.id,
            itemId: item.itemId,
            quantity: makeDecimal(item.quantity),
            note: item.note || `Telegram: ${item.rawName}`
          },
          include: {
            item: true
          }
        });
        const batchCode = buildProductionBatchCode(parsed.logDate, existingBatches + index + 1);
        const effectiveCuringHours = compositionsByProductId.get(item.itemId)?.curingHours ?? logItem.item.curingHours;
        const readyAt = calculateBatchReadyAt(parsed.logDate, effectiveCuringHours);
        const batch = await tx.productionBatch.create({
          data: {
            code: batchCode,
            dailyLogItemId: logItem.id,
            itemId: item.itemId,
            producedQuantity: makeDecimal(item.quantity),
            curingQuantity: makeDecimal(item.quantity),
            producedAt: parsed.logDate,
            readyAt
          }
        });

        createdItems.push({
          code: logItem.item.code,
          description: logItem.item.description,
          quantity: item.quantity,
          batchCode: batch.code,
          readyAt,
          curingHours: effectiveCuringHours
        });
      }

      await tx.auditLog.create({
        data: {
          userId: botUser.id,
          module: "Bot Telegram",
          action: AuditAction.CREATE,
          entity: "ProductionDailyLog",
          entityId: log.id,
          newValue: {
            chatId,
            logDate: parsed.logDate.toISOString(),
            items: createdItems,
            unmatchedItems: parsed.unmatchedItems
          }
        }
      });

      return {
        log,
        items: createdItems
      };
    });
  } catch (error) {
    await sendTelegramMessage(chatId, "Nao consegui registrar o diario no ERP. Avise o escritorio para conferir o sistema.");
    return handleApiError(error, "Nao foi possivel registrar diario via Telegram.", {
      context: {
        ...logContext,
        request,
        userId: botUser.id
      },
      event: "telegram_daily_log_error"
    });
  }

  const reply = [
    "Diario de producao registrado com sucesso.",
    `Data: ${parsed.logDate.toISOString().slice(0, 10)}`,
    ...result.items.map((item) => `${item.code}: ${item.quantity} un | lote ${item.batchCode} | cura ${item.curingHours}h | apto ${item.readyAt.toLocaleDateString("pt-BR")}`),
    parsed.unmatchedItems.length > 0 ? `Nao reconheci: ${parsed.unmatchedItems.join(", ")}` : ""
  ].filter(Boolean).join("\n");

  await sendTelegramMessage(chatId, reply);

  return apiSuccess({
    dailyLogId: result.log.id,
    items: result.items,
    unmatchedItems: parsed.unmatchedItems
  }, { status: 201 });
}
