import type { CampaignWithContent, Asset } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Piece = {
  key: string;
  track: "api" | "grupos";
  sort_order: number;
  send_at: string;
  role: string;
  offset_label: string;
  message: string;
  buttons: { type: "quick_reply" | "url"; text: string; url: string }[];
  meta_category?: "UTILITY" | "MARKETING";
  communities?: string;
  imageUrl?: string;
  badge: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const SEND_AT_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

// ---------------------------------------------------------------------------
// URL helper
// ---------------------------------------------------------------------------

export function publicAssetUrl(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${storagePath}`;
}

// ---------------------------------------------------------------------------
// send_at helpers
// ---------------------------------------------------------------------------

export function pieceDateKey(send_at: string): string {
  const m = send_at.match(SEND_AT_RE);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function pieceTime(send_at: string): string {
  const m = send_at.match(SEND_AT_RE);
  if (!m) return "";
  return `${m[4]}:${m[5]}`;
}

// ---------------------------------------------------------------------------
// Day header formatter
// ---------------------------------------------------------------------------

export function formatDayHeader(dateKey: string): string {
  if (!dateKey) return "sem data";
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "sem data";
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  const dow = date.getDay();
  return `${DIAS[dow]} ${d}/${mo}`;
}

// ---------------------------------------------------------------------------
// groupByDate
// ---------------------------------------------------------------------------

export function groupByDate(
  pieces: Piece[]
): { dateKey: string; label: string; pieces: Piece[] }[] {
  const map = new Map<string, Piece[]>();

  for (const piece of pieces) {
    const dk = pieceDateKey(piece.send_at);
    const bucket = map.get(dk) ?? [];
    bucket.push(piece);
    map.set(dk, bucket);
  }

  // Sort pieces within each group by pieceTime ascending (no time → end)
  for (const [, bucket] of map) {
    bucket.sort((a, b) => {
      const ta = pieceTime(a.send_at);
      const tb = pieceTime(b.send_at);
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return ta.localeCompare(tb);
    });
  }

  // Sort date keys ascending; "" goes last
  const dateKeys = [...map.keys()].sort((a, b) => {
    if (a === "" && b === "") return 0;
    if (a === "") return 1;
    if (b === "") return -1;
    return a.localeCompare(b);
  });

  return dateKeys.map((dk) => ({
    dateKey: dk,
    label: formatDayHeader(dk),
    pieces: map.get(dk)!,
  }));
}

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Returns the Monday of the week containing `date`.
 * JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat
 */
function mondayOf(date: Date): Date {
  const day = date.getDay(); // 0=Sun
  // distance from Monday: if Sun(0) → go back 6 days; Mon(1)→0; Tue(2)→1; etc.
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff);
  return monday;
}

/**
 * monthMatrix(year, month0) — month0 is 0-based (0=Jan, 6=Jul).
 * Returns an array of weeks (each week = 7 dateKey strings Mon→Sun)
 * that fully covers all days of the given month.
 */
export function monthMatrix(year: number, month0: number): string[][] {
  // First day of month
  const firstDay = new Date(year, month0, 1);
  // Last day of month
  const lastDay = new Date(year, month0 + 1, 0);

  // Start from the Monday of the week containing the first day
  let cursor = mondayOf(firstDay);

  const weeks: string[][] = [];

  while (cursor <= lastDay) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(toDateKey(cursor));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

/**
 * weekDays(centerDateKey) — returns the 7 dateKeys (Mon→Sun) of the week
 * containing the given dateKey.
 */
export function weekDays(centerDateKey: string): string[] {
  const m = centerDateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return [];
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  const monday = mondayOf(date);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(
      toDateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i))
    );
  }
  return days;
}

// ---------------------------------------------------------------------------
// toPieces
// ---------------------------------------------------------------------------

export function toPieces(campaign: CampaignWithContent, assets: Asset[]): Piece[] {
  const assetMap = new Map<string, Asset>(assets.map((a) => [a.id, a]));

  const pieces: Piece[] = [];

  // API touches
  for (const t of campaign.touches) {
    let imageUrl: string | undefined;
    for (const step of t.window_steps) {
      if (step.asset_id) {
        const asset = assetMap.get(step.asset_id);
        if (asset && asset.kind === "image") {
          imageUrl = publicAssetUrl(asset.storage_path);
          break;
        }
      }
    }

    pieces.push({
      key: `api-${t.sort_order}`,
      track: "api",
      sort_order: t.sort_order,
      send_at: t.send_at,
      role: t.role,
      offset_label: t.offset_label,
      message: t.template_body,
      buttons: t.buttons,
      meta_category: t.meta_category,
      imageUrl,
      badge: t.template_name,
    });
  }

  // Group posts
  for (const p of campaign.group_posts) {
    let imageUrl: string | undefined;
    if (p.asset_id) {
      const asset = assetMap.get(p.asset_id);
      if (asset && asset.kind === "image") {
        imageUrl = publicAssetUrl(asset.storage_path);
      }
    }

    pieces.push({
      key: `grupos-${p.sort_order}`,
      track: "grupos",
      sort_order: p.sort_order,
      send_at: p.send_at,
      role: p.role,
      offset_label: p.offset_label,
      message: p.copy,
      buttons: [],
      communities: p.communities,
      imageUrl,
      badge: p.message_code,
    });
  }

  return pieces;
}
