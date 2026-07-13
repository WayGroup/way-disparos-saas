export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/auth") ||
    // O worker do cron não tem sessão. Sem esta liberação o middleware o redireciona
    // para /login com 307 e a fila para de andar, em silêncio.
    // A rota tem autenticação própria: o header x-cron-secret.
    isCronPath(pathname)
  );
}

export function isCronPath(pathname: string): boolean {
  return pathname === "/api/cron" || pathname.startsWith("/api/cron/");
}
