-- =====================================================================
--  MatchPoint · 02_torneos.sql
--  Módulo de torneos y eventos 1X2
--  Autor: Integrante 2
--
--  HU-04 Crear torneo
--  HU-05 Evento 1X2 con periodo y costo
--  HU-06 Ver torneos y eventos abiertos
--  HU-10 Cierre automático al vencer el plazo
--
--  Requiere: 01_cuentas.sql (usuarios, mp_sesion)
-- =====================================================================

create table public.torneos (
  id            bigint generated always as identity primary key,
  nombre        text not null check (char_length(nombre) >= 3),
  deporte       text not null check (deporte in ('Fútbol', 'Baloncesto', 'Voleibol', 'Fútbol sala')),
  fecha_inicio  date not null,
  fecha_fin     date not null,
  estado        text not null default 'programado' check (estado in ('programado', 'en curso', 'finalizado')),
  creado_por    bigint not null references public.usuarios(id),
  creado_en     timestamptz not null default now(),
  constraint torneo_fechas check (fecha_fin >= fecha_inicio)
);

create table public.eventos (
  id              bigint generated always as identity primary key,
  torneo_id       bigint not null references public.torneos(id),
  local           text not null,
  visitante       text not null,
  apertura        timestamptz not null,
  cierre          timestamptz not null,
  inicio_partido  timestamptz not null,
  costo           integer not null check (costo > 0),
  premio          integer not null check (premio > 0),
  estado          text not null default 'programado' check (estado in ('programado', 'abierto', 'cerrado')),
  cerrado_en      timestamptz,
  constraint evento_periodo check (apertura < cierre and cierre <= inicio_partido),
  constraint evento_equipos check (lower(local) <> lower(visitante))
);

-- Las tres opciones 1X2 de cada evento
create table public.evento_opciones (
  evento_id  bigint not null references public.eventos(id) on delete cascade,
  codigo     char(1) not null check (codigo in ('L', 'E', 'V')),
  nombre     text not null,
  primary key (evento_id, codigo)
);

alter table public.torneos         enable row level security;
alter table public.eventos         enable row level security;
alter table public.evento_opciones enable row level security;
revoke all on public.torneos, public.eventos, public.evento_opciones from anon, authenticated;


-- ---------- Estado y cierre automático (HU-10) ----------

create or replace function public.mp_estado_evento(e public.eventos)
returns text language sql stable set search_path = public as $$
  select case when now() < e.apertura then 'programado'
              when now() < e.cierre   then 'abierto'
              else 'cerrado' end;
$$;

create or replace function public.mp_cerrar_vencidos()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.eventos e
     set estado = public.mp_estado_evento(e),
         cerrado_en = case when public.mp_estado_evento(e) = 'cerrado' then e.cierre else null end
   where e.estado <> public.mp_estado_evento(e);
  get diagnostics n = row_count;
  return n;
end $$;

-- Revisión cada minuto en el servidor, aunque nadie tenga la página abierta
create extension if not exists pg_cron;
select cron.schedule('mp-cierre-automatico', '* * * * *', 'select public.mp_cerrar_vencidos()');


-- ---------- HU-04 Crear torneo ----------

create or replace function public.mp_crear_torneo(
  p_token uuid, p_nombre text, p_deporte text, p_inicio date, p_fin date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u public.usuarios;
  f jsonb := '{}';
  v_id bigint;
begin
  u := public.mp_sesion(p_token, array['admin']);  -- solo usuarios autorizados

  if char_length(trim(coalesce(p_nombre, ''))) < 3 then f := f || '{"nombre":"Escribe un nombre de al menos 3 caracteres."}'; end if;
  if p_deporte is null or p_deporte not in ('Fútbol', 'Baloncesto', 'Voleibol', 'Fútbol sala') then f := f || '{"deporte":"Elige un deporte."}'; end if;
  if p_inicio is null then f := f || '{"inicio":"Indica la fecha de inicio."}'; end if;
  if p_fin is null then f := f || '{"fin":"Indica la fecha de fin."}'; end if;
  if p_inicio is not null and p_fin is not null and p_fin < p_inicio then
    f := f || '{"fin":"La fecha de fin no puede ser anterior a la de inicio."}';
  end if;
  if f <> '{}' then
    return jsonb_build_object('error', 'Revisa los campos marcados.', 'campos', f);
  end if;

  insert into public.torneos (nombre, deporte, fecha_inicio, fecha_fin, creado_por)
  values (trim(p_nombre), p_deporte, p_inicio, p_fin, u.id)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'nombre', trim(p_nombre), 'estado', 'programado');
end $$;


-- ---------- HU-05 Crear evento 1X2 ----------

create or replace function public.mp_crear_evento(
  p_token uuid, p_torneo_id bigint, p_local text, p_visitante text,
  p_apertura timestamptz, p_cierre timestamptz, p_inicio timestamptz,
  p_costo text, p_premio text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := '{}';
  v_local text := trim(coalesce(p_local, ''));
  v_visit text := trim(coalesce(p_visitante, ''));
  e public.eventos;
begin
  perform public.mp_sesion(p_token, array['admin']);

  if not exists (select 1 from public.torneos where id = p_torneo_id) then f := f || '{"torneoId":"Elige un torneo."}'; end if;
  if v_local = '' then f := f || '{"local":"Escribe el equipo local."}'; end if;
  if v_visit = '' then f := f || '{"visitante":"Escribe el equipo visitante."}';
  elsif lower(v_local) = lower(v_visit) then f := f || '{"visitante":"Local y visitante deben ser distintos."}'; end if;
  if p_apertura is null then f := f || '{"apertura":"Indica la apertura."}'; end if;
  if p_inicio is null then f := f || '{"inicio":"Indica el inicio del partido."}'; end if;
  if p_cierre is null then f := f || '{"cierre":"Indica el cierre."}';
  elsif p_apertura is not null and p_apertura >= p_cierre then f := f || '{"cierre":"El cierre debe ser posterior a la apertura."}';
  elsif p_inicio is not null and p_cierre > p_inicio then f := f || '{"cierre":"El cierre no puede superar el inicio del partido."}'; end if;
  if coalesce(p_costo, '') !~ '^[0-9]{1,6}$' or p_costo::integer <= 0 then f := f || '{"costo":"Entero positivo."}'; end if;
  if coalesce(p_premio, '') !~ '^[0-9]{1,6}$' or p_premio::integer <= 0 then f := f || '{"premio":"Entero positivo."}'; end if;
  if f <> '{}' then
    return jsonb_build_object('error', 'Revisa los campos marcados.', 'campos', f);
  end if;

  insert into public.eventos (torneo_id, local, visitante, apertura, cierre, inicio_partido, costo, premio)
  values (p_torneo_id, v_local, v_visit, p_apertura, p_cierre, p_inicio, p_costo::integer, p_premio::integer)
  returning * into e;

  update public.eventos set estado = public.mp_estado_evento(e) where id = e.id;

  insert into public.evento_opciones (evento_id, codigo, nombre)
  values (e.id, 'L', 'Local'), (e.id, 'E', 'Empate'), (e.id, 'V', 'Visitante');

  return jsonb_build_object('id', e.id, 'local', v_local, 'visitante', v_visit, 'estado', public.mp_estado_evento(e));
end $$;


-- ---------- HU-06 Ver torneos y eventos ----------

create or replace function public.mp_listar_torneos(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.mp_sesion(p_token);
  perform public.mp_cerrar_vencidos();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'nombre', t.nombre, 'deporte', t.deporte,
      'inicio', t.fecha_inicio, 'fin', t.fecha_fin, 'estado', t.estado,
      'eventos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', e.id, 'local', e.local, 'visitante', e.visitante,
          'apertura', e.apertura, 'cierre', e.cierre, 'inicio', e.inicio_partido,
          'costo', e.costo, 'premio', e.premio, 'estado', e.estado,
          'opciones', (select jsonb_agg(jsonb_build_object('codigo', o.codigo, 'nombre', o.nombre) order by position(o.codigo in 'LEV'))
                       from public.evento_opciones o where o.evento_id = e.id)
        ) order by e.inicio_partido)
        from public.eventos e where e.torneo_id = t.id), '[]'::jsonb)
    ) order by t.fecha_inicio, t.id)
    from public.torneos t), '[]'::jsonb);
end $$;

-- Lista corta de torneos para el formulario de eventos
create or replace function public.mp_torneos_opciones(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.mp_sesion(p_token, array['admin']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre) order by id desc)
                   from public.torneos), '[]'::jsonb);
end $$;


-- ---------- Permisos ----------

revoke execute on function public.mp_estado_evento(public.eventos), public.mp_cerrar_vencidos()
  from public, anon, authenticated;

revoke execute on function
  public.mp_crear_torneo(uuid, text, text, date, date),
  public.mp_crear_evento(uuid, bigint, text, text, timestamptz, timestamptz, timestamptz, text, text),
  public.mp_listar_torneos(uuid),
  public.mp_torneos_opciones(uuid) from public, authenticated;
grant execute on function
  public.mp_crear_torneo(uuid, text, text, date, date),
  public.mp_crear_evento(uuid, bigint, text, text, timestamptz, timestamptz, timestamptz, text, text),
  public.mp_listar_torneos(uuid),
  public.mp_torneos_opciones(uuid) to anon;
