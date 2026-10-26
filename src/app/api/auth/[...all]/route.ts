import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/server/auth";

// Better Auth's endpoints (sign-in, sign-up, sessions, two-factor). The instance is created on the first request so
// builds without credentials succeed.
export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
