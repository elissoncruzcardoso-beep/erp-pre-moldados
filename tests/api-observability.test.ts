import test from "node:test";
import assert from "node:assert/strict";
import { collectApiObservabilityFindings } from "../scripts/check-api-observability.mjs";

test("API observability guard accepts mutating route with handleApiError context", () => {
  const findings = collectApiObservabilityFindings(`
    export async function POST(request: Request) {
      try {
        return apiSuccess({});
      } catch (error) {
        return handleApiError(error, "Falha.", {
          context: {
            request,
            module: "Estoque",
            action: "registrar_movimentacao",
            userId: session.userId,
            entity: "StockMovement"
          },
          event: "stock_movement_error"
        });
      }
    }
  `, "src/app/api/estoque/movimentacoes/route.ts");

  assert.deepEqual(findings, []);
});

test("API observability guard rejects mutating route without operational logger", () => {
  const findings = collectApiObservabilityFindings(`
    export async function POST(request: Request) {
      try {
        return apiSuccess({});
      } catch (error) {
        return apiError("Falha ao salvar.", { status: 500 });
      }
    }
  `, "src/app/api/suprimentos/solicitacoes/route.ts");

  assert.equal(findings.length, 1);
  assert.match(findings[0], /precisa registrar erro operacional/);
});

test("API observability guard rejects handleApiError without request context", () => {
  const findings = collectApiObservabilityFindings(`
    export async function POST(request: Request) {
      try {
        return apiSuccess({});
      } catch (error) {
        return handleApiError(error, "Falha ao salvar.");
      }
    }
  `, "src/app/api/cadastros/clientes/route.ts");

  assert.equal(findings.length, 1);
  assert.match(findings[0], /precisa receber context/);
});

test("API observability guard ignores logout route exception", () => {
  const findings = collectApiObservabilityFindings(`
    export async function POST() {
      return NextResponse.json({ ok: true });
    }
  `, "src/app/api/auth/logout/route.ts");

  assert.deepEqual(findings, []);
});
