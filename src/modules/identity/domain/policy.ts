/**
 * RBAC rules (pure). Enforced server-side on every route/action, and again by Postgres RLS.
 * Admin permissions: ops (runner review, users, errands), support, finance, config, super (all).
 */
export type AdminPermission = 'ops' | 'support' | 'finance' | 'config' | 'super';
export type AdminGrant = { marketId: string | null; permissions: string[]; revokedAt: Date | null };
export type RoleRow = { role: string; status: string };

export const hasActiveRole = (roles: RoleRow[], role: string) => roles.some((r) => r.role === role && r.status === 'active');

const grantCovers = (g: AdminGrant, perm: AdminPermission) =>
  !g.revokedAt && (g.permissions.includes(perm) || g.permissions.includes('super'));

/** Markets where the admin holds `perm`: 'all', a list of market ids, or [] (none). */
export function adminScope(roles: RoleRow[], grants: AdminGrant[], perm: AdminPermission): 'all' | string[] {
  if (!hasActiveRole(roles, 'admin')) return [];
  const valid = grants.filter((g) => grantCovers(g, perm));
  if (valid.some((g) => g.marketId === null)) return 'all';
  return [...new Set(valid.map((g) => g.marketId!))];
}

export function canAdmin(roles: RoleRow[], grants: AdminGrant[], marketId: string, perm: AdminPermission): boolean {
  const scope = adminScope(roles, grants, perm);
  return scope === 'all' || scope.includes(marketId);
}

/** Only allow redirects to our own locale-prefixed paths (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, locale: string): string | null {
  if (!next || typeof next !== 'string') return null;
  if (!next.startsWith(`/${locale}/`) || next.startsWith('//') || next.includes('\\') || /[\r\n]/.test(next)) return null;
  try {
    const u = new URL(next, 'https://x.invalid');
    // Re-check after normalisation: '/en/../../evil' must not escape the locale prefix.
    return u.origin === 'https://x.invalid' && u.pathname.startsWith(`/${locale}/`) ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}
