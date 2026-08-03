import { slugifyIdentifier } from "@/lib/text";
import type { EvoGroup } from "@/lib/evolution/types";

export type SyncableCommunity = {
  id: string;
  name: string;
  identifier: string;
  wa_group_id: string | null;
  wa_subject: string;
  active: boolean;
};

export type SyncPlan = {
  insert: { name: string; identifier: string; wa_group_id: string; wa_subject: string }[];
  update: { id: string; wa_group_id: string; wa_subject: string; active: true }[];
  deactivate: string[];
};

/** Garante identifier único: "grupo-ouro", "grupo-ouro-2", "grupo-ouro-3"… */
export function uniqueIdentifier(base: string, taken: Set<string>): string {
  const slug = slugifyIdentifier(base) || "grupo";
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

/**
 * Casa os grupos vindos da Evolution com as comunidades já cadastradas.
 *
 * 1. Mesmo JID → atualiza (só emite update se algo mudou, para ser idempotente).
 * 2. Comunidade ainda sem JID cujo nome bate com o do grupo → vincula.
 * 3. Sobrou grupo → insere.
 * 4. Comunidade com JID que sumiu da Evolution → desativa (nunca apaga: pode haver
 *    envios históricos apontando para ela).
 */
export function planCommunitySync(existing: SyncableCommunity[], groups: EvoGroup[]): SyncPlan {
  const plan: SyncPlan = { insert: [], update: [], deactivate: [] };

  const byJid = new Map<string, SyncableCommunity>();
  for (const c of existing) {
    if (c.wa_group_id) byJid.set(c.wa_group_id, c);
  }

  const unlinkedByName = new Map<string, SyncableCommunity>();
  for (const c of existing) {
    if (c.wa_group_id) continue;
    const key = slugifyIdentifier(c.name);
    if (key && !unlinkedByName.has(key)) unlinkedByName.set(key, c);
  }

  const takenIdentifiers = new Set(existing.map((c) => c.identifier));
  const seenJids = new Set<string>();

  for (const group of groups) {
    seenJids.add(group.id);
    const subject = group.subject.trim();

    const linked = byJid.get(group.id);
    if (linked) {
      const changed = linked.wa_subject !== subject || !linked.active;
      if (changed) {
        plan.update.push({ id: linked.id, wa_group_id: group.id, wa_subject: subject, active: true });
      }
      continue;
    }

    const nameKey = slugifyIdentifier(subject);
    const candidate = nameKey ? unlinkedByName.get(nameKey) : undefined;
    if (candidate) {
      unlinkedByName.delete(nameKey);
      plan.update.push({ id: candidate.id, wa_group_id: group.id, wa_subject: subject, active: true });
      continue;
    }

    // Grupo sem subject: usa o próprio JID como nome, para não criar "" na lista.
    const name = subject || group.id;
    const identifier = uniqueIdentifier(name, takenIdentifiers);
    takenIdentifiers.add(identifier);
    plan.insert.push({ name, identifier, wa_group_id: group.id, wa_subject: subject });
  }

  for (const c of existing) {
    if (c.wa_group_id && c.active && !seenJids.has(c.wa_group_id)) {
      plan.deactivate.push(c.id);
    }
  }

  return plan;
}

export type SyncRisk =
  | { kind: "ok" }
  | { kind: "empty"; total: number }
  | { kind: "mass"; deactivating: number; total: number };

/**
 * Aplicar este plano é seguro?
 *
 * Existe porque `planCommunitySync` trata "grupo ausente da lista" como "grupo sumiu".
 * Logo depois de parear um número, a Evolution ainda está carregando os chats e
 * /chat/findChats responde vazio ou pela metade — sincronizar nessa janela desativaria
 * a lista inteira. Recuperável sincronizando de novo, mas no intervalo não há destino
 * para montar campanha.
 *
 * `total` conta só o que está vinculado E ativo: é o universo que pode ser perdido.
 * Comunidade sem JID nunca foi sincronizada, e comunidade já inativa não tem o que
 * perder.
 */
export function assessSyncRisk(
  plan: SyncPlan,
  existing: SyncableCommunity[],
  groupCount: number,
): SyncRisk {
  const total = existing.filter((c) => c.wa_group_id && c.active).length;

  if (groupCount === 0 && total > 0) return { kind: "empty", total };

  // Estritamente mais da metade: 6 de 10 pergunta, 5 de 10 não.
  if (plan.deactivate.length * 2 > total) {
    return { kind: "mass", deactivating: plan.deactivate.length, total };
  }

  return { kind: "ok" };
}
