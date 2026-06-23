export function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/auth");
}
