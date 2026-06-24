export function computeSendAt(anchor: string, offsetDays: number, offsetTime: string): string {
  if (!anchor) return "";
  const d = new Date(anchor);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + offsetDays);
  let hh = d.getHours();
  let mm = d.getMinutes();
  if (offsetTime && /^\d{1,2}:\d{2}$/.test(offsetTime)) {
    const [h, m] = offsetTime.split(":").map(Number);
    hh = h;
    mm = m;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(hh)}:${pad(mm)}`;
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function formatSendAt(value: string): string {
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return value;
  const [, y, mo, d, hh, mm] = m;
  const dow = new Date(Number(y), Number(mo) - 1, Number(d)).getDay();
  return `${DIAS[dow]} ${d}/${mo} · ${hh}:${mm}`;
}
