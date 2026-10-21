import { createServerFn } from "@tanstack/react-start";

export const fetchAuthConfig = createServerFn({ method: "GET" }).handler(() => ({
  googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
}));
