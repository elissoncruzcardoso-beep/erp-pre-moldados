import { apiSuccess } from "@/lib/api/responses";
import { getOptionalApiSession } from "@/lib/auth/guards";

export async function GET() {
  const session = await getOptionalApiSession();

  return apiSuccess({ user: session });
}
