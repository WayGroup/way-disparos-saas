-- Deslocamento relativo à HORA do evento, em minutos (negativo = antes).
-- Só se aplica quando offset_time está vazio (modo relativo); com hora fixa o
-- offset_time manda e este campo é ignorado. Default 0 = "na hora do evento",
-- que é exatamente o comportamento atual — nenhum slot existente muda.
alter table public.recipe_slots
  add column if not exists offset_minutes int not null default 0;

-- save_recipe lista as colunas dos slots uma a uma; offset_minutes precisa entrar
-- nos TRÊS pontos: colunas do insert, lista do select e o jsonb_to_recordset
-- (mais o alias do with ordinality). Se divergirem, salvar receita quebra.
create or replace function public.save_recipe(
  p_id uuid,
  p_name text,
  p_description text,
  p_active boolean,
  p_inputs jsonb,
  p_slots jsonb
) returns void
language plpgsql
as $$
begin
  update public.recipes
     set name = p_name, description = p_description, active = p_active, updated_at = now()
   where id = p_id;

  delete from public.recipe_inputs where recipe_id = p_id;
  delete from public.recipe_slots  where recipe_id = p_id;

  insert into public.recipe_inputs (recipe_id, label, field_type, required, is_anchor, sort_order)
  select p_id, x.label, coalesce(x.field_type, 'texto'),
         coalesce(x.required, true), coalesce(x.is_anchor, false), (x.ord - 1)::int
  from rows from (
    jsonb_to_recordset(coalesce(p_inputs, '[]'::jsonb))
      as (label text, field_type text, required boolean, is_anchor boolean)
  ) with ordinality as x(label, field_type, required, is_anchor, ord);

  insert into public.recipe_slots
    (recipe_id, track, code, offset_label, role, meta_category, target_communities,
     suggested_media, offset_days, offset_time, offset_minutes, sort_order)
  select p_id, s.track, coalesce(s.code, ''), coalesce(s.offset_label, ''), coalesce(s.role, ''),
         s.meta_category, s.target_communities, coalesce(s.suggested_media, ''),
         coalesce(s.offset_days, 0), coalesce(s.offset_time, ''),
         coalesce(s.offset_minutes, 0), (s.ord - 1)::int
  from rows from (
    jsonb_to_recordset(coalesce(p_slots, '[]'::jsonb))
      as (track text, code text, offset_label text, role text, meta_category text,
          target_communities text, suggested_media text, offset_days int, offset_time text,
          offset_minutes int)
  ) with ordinality as s(track, code, offset_label, role, meta_category,
                         target_communities, suggested_media, offset_days, offset_time,
                         offset_minutes, ord);
end;
$$;

grant execute on function public.save_recipe(uuid, text, text, boolean, jsonb, jsonb) to authenticated;
