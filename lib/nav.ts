export const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/campanhas", label: "Campanhas" },
  { href: "/copywriter", label: "Copywriter" },
  { href: "/receitas", label: "Receitas" },
  { href: "/midias", label: "Mídias" },
  { href: "/links", label: "Links" },
  { href: "/disparos", label: "Disparos" },
  { href: "/base-conhecimento", label: "Base de conhecimento" },
];

export function isActiveNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
