import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { getAuth } from "./auth";

export type CurrentUser = { id: string; name: string; email: string };

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Trebuie să fii autentificat.");
    this.name = "UnauthorizedError";
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getAuth().api.getSession({ headers: getRequest().headers });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
}

/** For server fns that need a signed-in user. Throws UnauthorizedError (status 401). */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    setResponseStatus(401);
    throw new UnauthorizedError();
  }
  return user;
}
