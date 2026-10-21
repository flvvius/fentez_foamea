// Pages a user can be sent back to after signing in. Matching exact strings instead of
// sanitizing arbitrary paths: browsers and URL parsers normalize paths in ways that turn
// `/\evil.com` or `/.//evil.com` into a protocol-relative `//evil.com`.
export const REDIRECT_TARGETS = ["/", "/harta", "/posteaza"] as const;

/** Returns `target` when it is one of REDIRECT_TARGETS, otherwise "/". */
export function safeRedirect(target: string | null | undefined): string {
  return (REDIRECT_TARGETS as readonly string[]).includes(target ?? "") ? (target as string) : "/";
}
