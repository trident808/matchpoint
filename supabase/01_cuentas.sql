-- =====================================================================
--  MatchPoint · 01_cuentas.sql
--  Módulo de usuarios, sesiones y créditos
--  Autor: Integrante 1
--
--  HU-01 Registro de participante
--  HU-02 Inicio de sesión por rol
--  HU-03 Asignación inicial de créditos
--  HU-09 Saldo y movimientos verificables
--
--  Las tablas no se pueden leer directamente desde la página (RLS sin
--  políticas). Todo pasa por funciones que validan la sesión y el rol.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tablas ----------

create table public.usuarios (
  id          bigint generated always as identity primary key,
  nombre      text not null check (char_length(nombre) >= 3),
  documento   text not null check (documento ~ '^[0-9]{6,10}$'),
  correo      text not null unique check (correo = lower(correo)),
  clave_hash  text not null,
  rol         text not null default 'participante'
              check (rol in ('participante', 'admin', 'auditor')),
  creado_en   timestamptz not null default now()
);

create table public.sesiones (
  token       uuid primary key default gen_random_uuid(),
  usuario_id  bigint not null references public.usuarios(id) on delete cascade,
  creada_en   timestamptz not null default now(),
  ultimo_uso  timestamptz not null default now()
);

-- Consecutivo compartido para los números de operación
create sequence public.operaciones_seq;

create table public.movimientos (
  id             bigint generated always as identity primary key,
  usuario_id     bigint not null references public.usuarios(id),
  tipo           text not null check (tipo in ('asignacion', 'debito', 'premio')),
  cantidad       integer not null check (cantidad <> 0),
  fecha          timestamptz not null default now(),
  autor_id       bigint not null references public.usuarios(id),
  operacion      text not null unique,
  pronostico_id  bigint unique  -- la llave foránea la agrega 03_pronosticos.sql
);

-- HU-03: una sola asignación inicial por usuario, garantizado por la base de datos
create unique index movimientos_una_asignacion
  on public.movimientos (usuario_id) where tipo = 'asignacion';

alter table public.usuarios    enable row level security;
alter table public.sesiones    enable row level security;
alter table public.movimientos enable row level security;
revoke all on public.usuarios, public.sesiones, public.movimientos from anon, authenticated;


-- ---------- Funciones internas (no se llaman desde la página) ----------

create or replace function public.mp_nueva_operacion(p_prefijo text)
returns text language sql security definer set search_path = public as $$
  select p_prefijo || '-' ||
         to_char(now() at time zone 'America/Bogota', 'YYYYMMDD') || '-' ||
         lpad(nextval('public.operaciones_seq')::text, 5, '0');
$$;

-- HU-09: el saldo siempre es la suma de los movimientos
create or replace function public.mp_saldo(p_usuario_id bigint)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(cantidad), 0)::integer from public.movimientos where usuario_id = p_usuario_id;
$$;

-- HU-02: valida el token, la inactividad (5 min) y el rol
create or replace function public.mp_sesion(p_token uuid, p_roles text[] default null)
returns public.usuarios
language plpgsql security definer set search_path = public as $$
declare
  s public.sesiones;
  u public.usuarios;
begin
  select * into s from public.sesiones where token = p_token;
  if not found then
    raise exception 'Inicia sesión para continuar.' using hint = 'SESION';
  end if;
  if s.ultimo_uso < now() - interval '5 minutes' then
    raise exception 'Tu sesión venció por inactividad. Inicia sesión de nuevo.' using hint = 'SESION';
  end if;

  update public.sesiones set ultimo_uso = now() where token = p_token;
  select * into u from public.usuarios where id = s.usuario_id;

  if p_roles is not null and not (u.rol = any (p_roles)) then
    raise exception 'No tienes permiso para usar esta función.';
  end if;
  return u;
end $$;


-- ---------- HU-01 Registro ----------

create or replace function public.mp_registrar(
  p_nombre text, p_documento text, p_correo text, p_clave text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  errores jsonb := '{}';
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_doc    text := trim(coalesce(p_documento, ''));
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_id     bigint;
begin
  if char_length(v_nombre) < 3 then
    errores := errores || '{"nombre":"Escribe tu nombre completo (mínimo 3 letras)."}';
  end if;
  if v_doc !~ '^[0-9]{6,10}$' then
    errores := errores || '{"documento":"El documento debe tener entre 6 y 10 dígitos, sin puntos."}';
  end if;
  if v_correo !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    errores := errores || '{"correo":"Escribe un correo válido, por ejemplo nombre@dominio.co."}';
  elsif exists (select 1 from public.usuarios where correo = v_correo) then
    errores := errores || '{"correo":"Ya existe una cuenta con este correo."}';
  end if;
  if coalesce(p_clave, '') !~ '[A-Za-z]' or coalesce(p_clave, '') !~ '[0-9]' or char_length(coalesce(p_clave, '')) < 8 then
    errores := errores || '{"password":"Mínimo 8 caracteres, con al menos una letra y un número."}';
  end if;

  if errores <> '{}' then
    return jsonb_build_object('error', 'Revisa los campos marcados.', 'campos', errores);
  end if;

  -- Rol participante y sin créditos hasta la asignación inicial
  insert into public.usuarios (nombre, documento, correo, clave_hash)
  values (v_nombre, v_doc, v_correo, crypt(p_clave, gen_salt('bf')))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'correo', v_correo);
exception when unique_violation then
  return jsonb_build_object('error', 'Revisa los campos marcados.',
                            'campos', '{"correo":"Ya existe una cuenta con este correo."}'::jsonb);
end $$;


-- ---------- HU-02 Sesión ----------

create or replace function public.mp_login(p_correo text, p_clave text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.usuarios;
  v_token uuid;
begin
  select * into u from public.usuarios where correo = lower(trim(coalesce(p_correo, '')));
  -- El mismo mensaje sin importar qué dato falló
  if not found or u.clave_hash <> crypt(coalesce(p_clave, ''), u.clave_hash) then
    raise exception 'Correo o contraseña incorrectos.';
  end if;
  insert into public.sesiones (usuario_id) values (u.id) returning token into v_token;
  return jsonb_build_object('token', v_token);
end $$;

create or replace function public.mp_logout(p_token uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.sesiones where token = p_token;
$$;

create or replace function public.mp_yo(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare u public.usuarios;
begin
  u := public.mp_sesion(p_token);
  return jsonb_build_object('id', u.id, 'nombre', u.nombre, 'correo', u.correo,
                            'rol', u.rol, 'saldo', public.mp_saldo(u.id));
end $$;


-- ---------- HU-03 Asignación inicial ----------

create or replace function public.mp_asignar_inicial(p_token uuid, p_usuario_id bigint, p_cantidad text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  admin public.usuarios;
  p public.usuarios;
  v_op text;
begin
  admin := public.mp_sesion(p_token, array['admin']);

  select * into p from public.usuarios where id = p_usuario_id and rol = 'participante' for update;
  if not found then
    return jsonb_build_object('error', 'Elige un participante.', 'campos', '{"participante":"Elige un participante."}'::jsonb);
  end if;
  if coalesce(p_cantidad, '') !~ '^[0-9]+$' or p_cantidad::bigint <= 0 or p_cantidad::bigint > 1000000 then
    return jsonb_build_object('error', 'La cantidad debe ser un entero positivo.', 'campos', '{"cantidad":"Entero positivo."}'::jsonb);
  end if;
  if exists (select 1 from public.movimientos where usuario_id = p.id and tipo = 'asignacion') then
    raise exception '% ya recibió su asignación inicial. No se aplica dos veces.', p.nombre;
  end if;

  v_op := public.mp_nueva_operacion('AS');
  insert into public.movimientos (usuario_id, tipo, cantidad, autor_id, operacion)
  values (p.id, 'asignacion', p_cantidad::integer, admin.id, v_op);

  return jsonb_build_object('operacion', v_op, 'cantidad', p_cantidad::integer);
end $$;

-- Lista de participantes con el estado de su asignación (admin y auditor)
create or replace function public.mp_participantes(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.mp_sesion(p_token, array['admin', 'auditor']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id, 'nombre', u.nombre, 'correo', u.correo,
      'saldo', public.mp_saldo(u.id),
      'asignacion', (select jsonb_build_object('fecha', m.fecha, 'cantidad', m.cantidad,
                                               'operacion', m.operacion, 'autor', a.correo)
                     from public.movimientos m join public.usuarios a on a.id = m.autor_id
                     where m.usuario_id = u.id and m.tipo = 'asignacion')
    ) order by u.nombre)
    from public.usuarios u where u.rol = 'participante'), '[]'::jsonb);
end $$;


-- ---------- HU-09 Saldo y movimientos ----------

create or replace function public.mp_movimientos(p_token uuid, p_usuario_id bigint default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u public.usuarios;
  v_id bigint;
  v_lista jsonb;
begin
  u := public.mp_sesion(p_token, array['participante', 'auditor']);
  v_id := coalesce(p_usuario_id, u.id);
  -- Solo el titular y los auditores
  if u.rol = 'participante' and v_id <> u.id then
    raise exception 'Solo puedes ver tus propios movimientos.';
  end if;

  execute $q$
    select coalesce(jsonb_agg(jsonb_build_object(
             'tipo', m.tipo, 'cantidad', m.cantidad, 'fecha', m.fecha,
             'operacion', m.operacion, 'autor', a.correo,
             'evento', case when e.id is null then null else e.local || ' vs ' || e.visitante end,
             'opcion', p.opcion) order by m.fecha desc, m.id desc), '[]'::jsonb)
    from public.movimientos m
    join public.usuarios a on a.id = m.autor_id
    left join public.pronosticos p on p.id = m.pronostico_id
    left join public.eventos e on e.id = p.evento_id
    where m.usuario_id = $1
  $q$ into v_lista using v_id;

  return jsonb_build_object('saldo', public.mp_saldo(v_id), 'movimientos', v_lista);
end $$;


-- ---------- Permisos ----------

revoke execute on function public.mp_nueva_operacion(text), public.mp_saldo(bigint),
  public.mp_sesion(uuid, text[]) from public, anon, authenticated;

-- Estas sí las llama la página (rol anon); cada una valida el token por dentro
revoke execute on function public.mp_registrar(text, text, text, text), public.mp_login(text, text),
  public.mp_logout(uuid), public.mp_yo(uuid), public.mp_asignar_inicial(uuid, bigint, text),
  public.mp_participantes(uuid), public.mp_movimientos(uuid, bigint) from public, authenticated;
grant execute on function public.mp_registrar(text, text, text, text), public.mp_login(text, text),
  public.mp_logout(uuid), public.mp_yo(uuid), public.mp_asignar_inicial(uuid, bigint, text),
  public.mp_participantes(uuid), public.mp_movimientos(uuid, bigint) to anon;
