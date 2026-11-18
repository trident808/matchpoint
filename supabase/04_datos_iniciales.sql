-- =====================================================================
--  MatchPoint · 04_datos_iniciales.sql
--  Cuentas de administración y un torneo de ejemplo
--  Autor: Integrante 3 (integración)
--
--  Las claves de estas cuentas están en el README, no en la página.
--  Cámbialas después de la primera entrega.
-- =====================================================================

insert into public.usuarios (nombre, documento, correo, clave_hash, rol) values
  ('Administración MatchPoint', '1000000001', 'admin@matchpoint.co',
   extensions.crypt('Admin2026', extensions.gen_salt('bf')), 'admin'),
  ('Auditoría Interna', '1000000002', 'auditor@matchpoint.co',
   extensions.crypt('Audit2026', extensions.gen_salt('bf')), 'auditor');

-- Torneo de ejemplo con partidos en los próximos días
with t as (
  insert into public.torneos (nombre, deporte, fecha_inicio, fecha_fin, creado_por)
  select 'Liga BetPlay 2026-II · Cuadrangulares', 'Fútbol',
         (now() at time zone 'America/Bogota')::date,
         (now() at time zone 'America/Bogota')::date + 30, id
  from public.usuarios where correo = 'admin@matchpoint.co'
  returning id
), ev as (
  insert into public.eventos (torneo_id, local, visitante, apertura, cierre, inicio_partido, costo, premio)
  select t.id, x.local, x.visitante, now() + x.ap, now() + x.ci, now() + x.ini, x.costo, x.premio
  from t, (values
    ('Millonarios',     'Atlético Nacional', interval '0 hours', interval '2 days',  interval '2 days 2 hours', 10, 30),
    ('América de Cali', 'Junior',            interval '0 hours', interval '4 days',  interval '4 days 2 hours', 10, 30),
    ('Santa Fe',        'Deportes Tolima',   interval '1 day',   interval '6 days',  interval '6 days 2 hours', 15, 45)
  ) as x(local, visitante, ap, ci, ini, costo, premio)
  returning id
)
insert into public.evento_opciones (evento_id, codigo, nombre)
select ev.id, o.codigo, o.nombre
from ev, (values ('L', 'Local'), ('E', 'Empate'), ('V', 'Visitante')) as o(codigo, nombre);

select public.mp_cerrar_vencidos();
