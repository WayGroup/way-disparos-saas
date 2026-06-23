export const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/campanhas", label: "Campanhas" },
  { href: "/receitas", label: "Receitas" },
  { href: "/midias", label: "Mídias" },
  { href: "/base-conhecimento", label: "Base de conhecimento" },
];

export function isActiveNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
