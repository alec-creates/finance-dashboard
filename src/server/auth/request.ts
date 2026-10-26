import { getAuth } from "./index";

/** The fields of a signed-in user that application code may use. Never includes secrets. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  twoFactorEnabled: boolean;
}

/** Resolves the user from request headers (session cookie), checking the session in the database. */
export async function getUserFromHeaders(
  headers: Headers,
): Promise<AuthenticatedUser | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session) {
    return null;
  }
  const { id, email, name, twoFactorEnabled } =
    session.user as typeof session.user & { twoFactorEnabled?: boolean | null };
  return { id, email, name, twoFactorEnabled: twoFactorEnabled === true };
}

const json = (status: number, error: string) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );

/**
 * For API route handlers: the signed-in user, or a 401/403 response. Financial endpoints must also require
 * two-factor authentication to be set up.
 */
export async function requireApiUser(
  request: Request,
): Promise<AuthenticatedUser | Response> {
  const user = await getUserFromHeaders(request.headers);
  if (!user) {
    return json(401, "Not signed in.");
  }
  if (!user.twoFactorEnabled) {
    return json(403, "Set up two-factor authentication to continue.");
  }
  return user;
}
