-- =====================================================================
--  MatchPoint · 03_pronosticos.sql
--  Módulo de pronósticos y débito de créditos
--  Autor: Integrante 3
--
--  HU-07 Pronóstico válido en evento abierto
--  HU-08 Débito único sin saldo negativo
--
--  Requiere: 01_cuentas.sql y 02_torneos.sql
--
--  Cómo se evita el doble cobro:
--   - Cada intento trae una llave única (idem_key). Si llega dos veces,
--     se devuelve el pronóstico ya registrado sin volver a cobrar.
--   - Pronóstico y débito se insertan en la misma transacción.
--   - La fila del usuario se bloquea (FOR UPDATE) mientras se revisa
--     el saldo, para que dos envíos simultáneos no lo dejen negativo.
-- =====================================================================

create table public.pronosticos (
  id          bigint generated always as identity primary key,
  operacion   text not null unique,
  usuario_id  bigint not null references public.usuarios(id),
  evento_id   bigint not null references public.eventos(id),
  opcion      char(1) not null,
  costo       integer not null check (costo > 0),
  fecha       timestamptz not null default now(),
  idem_key    uuid not null unique,
  constraint un_pronostico_por_evento unique (usuario_id, evento_id),
  constraint opcion_del_evento foreign key (evento_id, opcion)
    references public.evento_opciones (evento_id, codigo)
);

-- El débito queda ligado al pronóstico
alter table public.movimientos
  add constraint movimientos_pronostico_fk foreign key (pronostico_id) references public.pronosticos(id);

alter table public.pronosticos enable row level security;
revoke all on public.pronosticos from anon, authenticated;

-- HU-10: los pronósticos registrados no se pueden modificar ni borrar
create or replace function public.mp_bloquear_cambios()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Los pronósticos registrados no se pueden modificar.';
end $$;

create trigger pronosticos_inmutables
  before update or delete on public.pronosticos
  for each row execute function public.mp_bloquear_cambios();


-- ---------- HU-07 + HU-08 ----------

create or replace function public.mp_registrar_pronostico(
  p_token uuid, p_evento_id bigint, p_opcion text, p_idem_key uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u        public.usuarios;
  e        public.eventos;
  p        public.pronosticos;
  v_estado text;
  v_saldo  integer;
  v_op     text;
  v_id     bigint;
begin
  u := public.mp_sesion(p_token, array['participante']);

  -- 1. ¿Es un reintento de un envío que ya quedó registrado?
  select * into p from public.pronosticos where idem_key = p_idem_key;
  if found then
    if p.usuario_id <> u.id then raise exception 'Solicitud no válida.'; end if;
    return jsonb_build_object('operacion', p.operacion, 'costo', p.costo, 'opcion', p.opcion, 'repetido', true);
  end if;

  -- 2. El evento debe estar dentro de su periodo
  perform public.mp_cerrar_vencidos();
  select * into e from public.eventos where id = p_evento_id;
  if not found then raise exception 'El evento no existe.'; end if;

  v_estado := public.mp_estado_evento(e);
  if v_estado = 'programado' then
    raise exception 'El periodo de pronósticos de este evento aún no abre.';
  elsif v_estado = 'cerrado' then
    raise exception 'El periodo de pronósticos ya cerró. Tu pronóstico no se registró.';
  end if;

  if not exists (select 1 from public.evento_opciones where evento_id = e.id and codigo = p_opcion) then
    raise exception 'Esa opción no pertenece al evento.';
  end if;

  -- 3. Bloqueo del usuario: los envíos simultáneos esperan su turno
  perform 1 from public.usuarios where id = u.id for update;

  if exists (select 1 from public.pronosticos where usuario_id = u.id and evento_id = e.id) then
    raise exception 'Ya tienes un pronóstico en este evento.';
  end if;

  v_saldo := public.mp_saldo(u.id);
  if v_saldo < e.costo then
    raise exception 'Saldo insuficiente: tienes % créditos y el evento cuesta %. El pronóstico no se registró.', v_saldo, e.costo;
  end if;

  -- 4. Pronóstico y débito en la misma transacción
  v_op := public.mp_nueva_operacion('PR');
  insert into public.pronosticos (operacion, usuario_id, evento_id, opcion, costo, idem_key)
  values (v_op, u.id, e.id, p_opcion, e.costo, p_idem_key)
  returning id into v_id;

  insert into public.movimientos (usuario_id, tipo, cantidad, autor_id, operacion, pronostico_id)
  values (u.id, 'debito', -e.costo, u.id, v_op, v_id);

  return jsonb_build_object('operacion', v_op, 'costo', e.costo, 'opcion', p_opcion,
                            'saldo', v_saldo - e.costo, 'repetido', false);

exception when unique_violation then
  -- Dos envíos con la misma llave llegaron a la vez: devolvemos el que quedó
  select * into p from public.pronosticos where idem_key = p_idem_key and usuario_id = u.id;
  if found then
    return jsonb_build_object('operacion', p.operacion, 'costo', p.costo, 'opcion', p.opcion, 'repetido', true);
  end if;
  raise exception 'Ya tienes un pronóstico en este evento.';
end $$;

-- Pronósticos del participante, para marcar su opción en cada evento
create or replace function public.mp_mis_pronosticos(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare u public.usuarios;
begin
  u := public.mp_sesion(p_token, array['participante']);
  return coalesce((select jsonb_agg(jsonb_build_object('evento_id', evento_id, 'opcion', opcion,
                                                       'operacion', operacion, 'fecha', fecha))
                   from public.pronosticos where usuario_id = u.id), '[]'::jsonb);
end $$;


-- ---------- Permisos ----------

revoke execute on function public.mp_bloquear_cambios() from public, anon, authenticated;

revoke execute on function
  public.mp_registrar_pronostico(uuid, bigint, text, uuid),
  public.mp_mis_pronosticos(uuid) from public, authenticated;
grant execute on function
  public.mp_registrar_pronostico(uuid, bigint, text, uuid),
  public.mp_mis_pronosticos(uuid) to anon;
