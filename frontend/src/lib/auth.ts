import Cookies from "js-cookie";

const TOKEN_KEY = "staffbot_token";
const REFRESH_KEY = "staffbot_refresh";
const COOKIE_OPTS = { expires: 7, sameSite: "lax" as const };

export function saveTokens(accessToken: string, refreshToken: string) {
  Cookies.set(TOKEN_KEY, accessToken, COOKIE_OPTS);
  Cookies.set(REFRESH_KEY, refreshToken, COOKIE_OPTS);
}

export function clearTokens() {
  Cookies.remove(TOKEN_KEY);
  Cookies.remove(REFRESH_KEY);
}

export function getAccessToken(): string | undefined {
  return Cookies.get(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!Cookies.get(TOKEN_KEY);
}

export interface CurrentUser {
  sub: string;
  role: "super_admin" | "company_admin" | "company_viewer";
  tenantId: string | null;
}

/** Decode the JWT payload without verifying the signature (client-side only). */
export function getCurrentUser(): CurrentUser | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { sub: payload.sub, role: payload.role, tenantId: payload.tenantId ?? null };
  } catch {
    return null;
  }
}
