"use client";

/**
 * Acima deste tamanho a lista de grupos vira resumo. Uma campanha real chegou a 166
 * grupos: renderizados todos, viram um muro que empurra as peças para fora da tela.
 */
export const RESUMO_LIMITE = 8;

/**
 * Mostra os primeiros nomes como chips e resume o resto em "+N outros".
 *
 * Só apresentação: sem estado e sem callback. Quem controla abrir e fechar é o pai —
 * a barra da campanha diz "ver todos" e o seletor da peça diz "alterar", e um botão
 * aqui dentro obrigaria os dois a serem iguais.
 *
 * Com `names.length <= limite` ele renderiza todos os chips e nenhum "+N outros", que
 * é exatamente a tela de antes desta mudança — por isso o consumidor não precisa de um
 * ramo separado para campanha pequena.
 */
export function GroupSummary({
  names,
  limite = RESUMO_LIMITE,
}: {
  names: string[];
  limite?: number;
}) {
  if (names.length === 0) return null;

  const mostrados = names.slice(0, limite);
  const resto = names.length - mostrados.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {mostrados.map((nome, i) => (
        // Nome não é único: a mesma turma aparece como dois grupos com o mesmo título.
        <span
          key={`${nome}-${i}`}
          className="rounded-full border border-emerald bg-emerald/10 text-emeraldd font-semibold px-2.5 py-1 text-xs"
        >
          {nome}
        </span>
      ))}
      {resto > 0 && <span className="font-mono text-xs text-muted">+{resto} outros</span>}
    </div>
  );
}
