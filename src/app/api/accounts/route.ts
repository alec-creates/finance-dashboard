import { getPrisma } from "@/server/db/client";
import { requireApiUser } from "@/server/auth/request";
import { listAccounts } from "@/server/services/accounts";

/** The signed-in owner's accounts. Unauthenticated: 401; 2FA not set up: 403. */
export async function GET(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof Response) {
    return user;
  }
  const accounts = await listAccounts(getPrisma(), user.id);
  return Response.json(
    { accounts },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
