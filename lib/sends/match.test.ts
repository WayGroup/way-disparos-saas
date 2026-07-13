import { describe, it, expect } from "vitest";
import { matchCommunities, type MatchableCommunity } from "@/lib/sends/match";

const COMMUNITIES: MatchableCommunity[] = [
  { id: "a", name: "Comunidade Ouro", identifier: "comunidade-ouro", wa_subject: "Comunidade Ouro" },
  { id: "b", name: "Alunos Way", identifier: "alunos-way", wa_subject: "Alunos Way 2026" },
  { id: "c", name: "Leads Frios", identifier: "leads-frios", wa_subject: "" },
];

describe("matchCommunities", () => {
  it("casa pelo nome exato", () => {
    expect(matchCommunities("Comunidade Ouro", COMMUNITIES)).toEqual(["a"]);
  });

  it("ignora acento e caixa", () => {
    expect(matchCommunities("COMUNIDADE ourô", COMMUNITIES)).toEqual(["a"]);
  });

  it("quebra por vírgula", () => {
    expect(matchCommunities("Comunidade Ouro, Leads Frios", COMMUNITIES)).toEqual(["a", "c"]);
  });

  it("quebra por barra, ponto-e-vírgula e mais", () => {
    expect(matchCommunities("Comunidade Ouro / Leads Frios", COMMUNITIES)).toEqual(["a", "c"]);
    expect(matchCommunities("Comunidade Ouro; Leads Frios", COMMUNITIES)).toEqual(["a", "c"]);
    expect(matchCommunities("Comunidade Ouro + Leads Frios", COMMUNITIES)).toEqual(["a", "c"]);
  });

  it("quebra por ' e '", () => {
    expect(matchCommunities("Comunidade Ouro e Leads Frios", COMMUNITIES)).toEqual(["a", "c"]);
  });

  it("casa pelo wa_subject quando o nome difere", () => {
    expect(matchCommunities("Alunos Way 2026", COMMUNITIES)).toEqual(["b"]);
  });

  it("'todas' devolve todos os grupos", () => {
    expect(matchCommunities("todas as comunidades", COMMUNITIES)).toEqual(["a", "b", "c"]);
    expect(matchCommunities("Todos", COMMUNITIES)).toEqual(["a", "b", "c"]);
  });

  it("casa parcialmente quando o token é um pedaço do nome", () => {
    expect(matchCommunities("Ouro", COMMUNITIES)).toEqual(["a"]);
  });

  it("não duplica quando o mesmo grupo aparece duas vezes", () => {
    expect(matchCommunities("Comunidade Ouro, Ouro", COMMUNITIES)).toEqual(["a"]);
  });

  it("devolve vazio para texto desconhecido", () => {
    expect(matchCommunities("Grupo do Zap do Tio", COMMUNITIES)).toEqual([]);
  });

  it("devolve vazio para string vazia", () => {
    expect(matchCommunities("", COMMUNITIES)).toEqual([]);
    expect(matchCommunities("   ", COMMUNITIES)).toEqual([]);
  });

  it("devolve vazio quando não há grupos sincronizados", () => {
    expect(matchCommunities("Comunidade Ouro", [])).toEqual([]);
  });
});
