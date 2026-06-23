export function slugifyIdentifier(name: string): string {
  return name
    .replace(/º/g, "o")
    .replace(/ª/g, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
