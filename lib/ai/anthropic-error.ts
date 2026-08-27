// Traduz erros da API da Anthropic em mensagens claras em PT-BR. Sem isto, um 400 da API
// (ex.: conta sem créditos) atravessa a Server Action como o críptico "An error occurred in
// the Server Components render" — o usuário não faz ideia de que é billing, não bug.

/** Extrai a mensagem mais específica de um erro do SDK da Anthropic (ou de qualquer erro). */
function anthropicMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (!e || typeof e !== "object") return "";
  const o = e as Record<string, unknown>;
  const inner = o.error as Record<string, unknown> | undefined;
  const innerInner = inner?.error as Record<string, unknown> | undefined;
  const candidate =
    (typeof innerInner?.message === "string" && innerInner.message) ||
    (typeof inner?.message === "string" && inner.message) ||
    (typeof o.message === "string" && o.message) ||
    "";
  return candidate;
}

/**
 * Devolve um Error com mensagem amigável a partir de um erro da IA. Reconhece os casos
 * comuns (sem créditos, limite de taxa, sobrecarga, chave inválida) e, no resto, preserva
 * a mensagem original da API. Sempre devolve um Error normal — serializável pela Server Action.
 */
export function friendlyAnthropicError(e: unknown): Error {
  const raw = anthropicMessage(e);
  const msg = raw.toLowerCase();
  const status = (e as { status?: number })?.status;

  if (msg.includes("credit balance is too low") || msg.includes("plans & billing")) {
    return new Error(
      "A IA (Anthropic) está sem créditos no momento, então não consigo gerar nem refinar copy. " +
        "Adicione créditos em console.anthropic.com → Plans & Billing e tente de novo — assim que o saldo entrar, volta a funcionar.",
    );
  }
  if (status === 429 || msg.includes("rate limit")) {
    return new Error("Muitas requisições à IA agora. Espere alguns segundos e tente de novo.");
  }
  if (status === 529 || msg.includes("overloaded")) {
    return new Error("A IA está sobrecarregada no momento. Tente de novo em alguns segundos.");
  }
  if (status === 401 || msg.includes("authentication") || msg.includes("x-api-key") || msg.includes("api key")) {
    return new Error("A chave da API da IA está inválida ou ausente. Confira ANTHROPIC_API_KEY no ambiente.");
  }
  return new Error(raw ? `Erro na IA: ${raw}` : "A IA não respondeu como esperado. Tente de novo.");
}
