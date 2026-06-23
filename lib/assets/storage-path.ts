export function buildStoragePath(filename: string, seed: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot > 0 ? filename.slice(dot + 1) : "";
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const slug = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ext ? `${seed}-${slug}.${ext}` : `${seed}-${slug}`;
}
