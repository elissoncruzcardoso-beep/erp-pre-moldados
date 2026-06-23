import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "degraded";

const responseHeaders = {
  "Cache-Control": "no-store"
};

async function checkDatabase(): Promise<HealthStatus> {
  try {
    const prisma = getPrisma();
    await prisma.user.findFirst({
      select: {
        id: true
      }
    });

    return "ok";
  } catch {
    return "degraded";
  }
}

export async function GET() {
  const database = await checkDatabase();
  const status: HealthStatus = database === "ok" ? "ok" : "degraded";

  return NextResponse.json(
    {
      ok: status === "ok",
      service: "precast-erp",
      status,
      timestamp: new Date().toISOString(),
      checks: {
        app: "ok",
        database
      }
    },
    {
      status: status === "ok" ? 200 : 503,
      headers: responseHeaders
    }
  );
}
