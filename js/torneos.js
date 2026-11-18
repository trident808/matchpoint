// ============================================================
//  MatchPoint · torneos.js
//  Módulo de torneos y eventos 1X2
//  Autor: Integrante 2
//
//  HU-04  Crear torneo
//  HU-05  Evento 1X2 con periodo y costo
//  HU-06  Ver torneos y eventos abiertos
//  HU-10  Cierre automático al vencer el plazo
//
//  Funciones de Supabase (supabase/02_torneos.sql):
//    mp_crear_torneo, mp_crear_evento, mp_listar_torneos, mp_torneos_opciones
//  Usa de pronosticos.js: cargarMisPronosticos, opcionesPronostico (si están cargados)
// ============================================================

const DEPORTES = ['Fútbol', 'Baloncesto', 'Voleibol', 'Fútbol sala'];

// El servidor cierra los eventos cada minuto (pg_cron). Aquí se recalcula
// para que la tarjeta cambie a "cerrado" justo a la hora, sin esperar.
const estadoEvento = (e, now = Date.now()) => {
  if (now < Date.parse(e.apertura)) return 'programado';
  if (now < Date.parse(e.cierre)) return 'abierto';
  return 'cerrado';
};

// ---------- vistas ----------

const tarjetaEvento = (e, u, mios) => {
  const st = estadoEvento(e);
  let cuerpo;

  if (st === 'cerrado') {
    cuerpo = `<div class="optlist">Opciones: ${esc(e.local)} · Empate · ${esc(e.visitante)}<br>Cerrado: ya no admite pronósticos.</div>`;
    const mio = mios[e.id];
    if (mio) cuerpo += `<div class="mine">Tu pronóstico: <b>${NOMBRE_OPCION[mio.opcion]}</b> · operación <span class="mono">${esc(mio.operacion)}</span></div>`;
  } else if (typeof opcionesPronostico === 'function') {
    cuerpo = opcionesPronostico(e, u, st, mios);          // lo pone el módulo de pronósticos
  } else {
    cuerpo = `<div class="optlist">Opciones: ${esc(e.local)} · Empate · ${esc(e.visitante)}</div>`;
  }
  if (st === 'programado') cuerpo += `<div class="check">Abre el ${fmtFecha(e.apertura)}.</div>`;

  return `<article class="card ev ${st}">
    <div class="row" style="justify-content:space-between"><span class="chip ${st}">${st}</span>${u.rol === 'participante' ? tag('HU-07/08') : ''}</div>
    <div class="match">${esc(e.local)} <i>vs</i> ${esc(e.visitante)}</div>
    <dl class="kv">
      <dt>Partido</dt><dd>${fmtFecha(e.inicio)}</dd>
      <dt>Cierre</dt><dd>${fmtFecha(e.cierre)} (hora Colombia)</dd>
      <dt>Costo · premio</dt><dd>${e.costo} · ${e.premio} créditos</dd>
    </dl>
    ${cuerpo}
  </article>`;
};

views.torneos = async (u) => {
  const esParticipante = u.rol === 'participante';
  const [ts, mios] = await Promise.all([
    rpc('mp_listar_torneos'),
    esParticipante && typeof cargarMisPronosticos === 'function' ? cargarMisPronosticos() : {}
  ]);

  const aviso = esParticipante
    ? `<div class="notice">Tu saldo: <b>${u.saldo} créditos</b>. Los créditos de MatchPoint no tienen valor monetario.</div>`
    : '';

  const secciones = ts.length
    ? ts.map(t => `<section class="torneo">
        <div class="torneo-head"><h2>${esc(t.nombre)}</h2><span class="meta">${esc(t.deporte)} · ${fmtDia(t.inicio)} – ${fmtDia(t.fin)}</span><span class="chip programado">${esc(t.estado)}</span></div>
        ${t.eventos.length ? `<div class="events">${t.eventos.map(e => tarjetaEvento(e, u, mios)).join('')}</div>` : '<p class="check">Este torneo todavía no tiene eventos.</p>'}
      </section>`).join('')
    : '<div class="card">Aún no hay torneos. Un administrador puede crearlos en “Crear torneo”.</div>';

  return `<div class="head"><h1>Torneos y eventos</h1>${tag('HU-06')}${tag('HU-10')}</div>
    <p class="lede">Horas en hora de Colombia (UTC−5). Cada evento se cierra solo al llegar su hora de cierre.</p>
    ${aviso}${secciones}`;
};

views.nuevoTorneo = async () => {
  const hoy = colISO(Date.now()).slice(0, 10);
  return `<div class="head"><h1>Crear torneo</h1>${tag('HU-04')}</div>
    <form class="card stack" data-form="torneo" novalidate>
      <div class="grid2">
        <div class="field${inv('torneo', 'nombre')}"><label for="t-nombre">Nombre</label><input id="t-nombre" name="nombre" value="${val('torneo', 'nombre')}" placeholder="Copa Interfacultades 2026">${ferr('torneo', 'nombre')}</div>
        <div class="field${inv('torneo', 'deporte')}"><label for="t-deporte">Deporte</label><select id="t-deporte" name="deporte">${DEPORTES.map(d => `<option ${val('torneo', 'deporte', 'Fútbol') === d ? 'selected' : ''}>${d}</option>`).join('')}</select>${ferr('torneo', 'deporte')}</div>
        <div class="field${inv('torneo', 'inicio')}"><label for="t-inicio">Fecha de inicio</label><input id="t-inicio" name="inicio" type="date" value="${val('torneo', 'inicio', hoy)}">${ferr('torneo', 'inicio')}</div>
        <div class="field${inv('torneo', 'fin')}"><label for="t-fin">Fecha de fin</label><input id="t-fin" name="fin" type="date" value="${val('torneo', 'fin')}">${ferr('torneo', 'fin')}</div>
      </div>
      <div class="row"><button class="btn primary">Crear torneo</button><span class="check">Queda en estado <b>programado</b>.</span></div>
    </form>`;
};

views.nuevoEvento = async () => {
  const torneos = await rpc('mp_torneos_opciones');
  if (!torneos.length) {
    return `<div class="head"><h1>Crear evento 1X2</h1>${tag('HU-05')}</div><div class="card">Primero crea un torneo.</div>`;
  }
  const n = Date.now();
  const dt = ms => colISO(n + ms).slice(0, 16);
  const F = (name, label, type, def, extra = '') =>
    `<div class="field${inv('evento', name)}"><label for="e-${name}">${label}</label><input id="e-${name}" name="${name}" type="${type}" value="${val('evento', name, def)}" ${extra}>${ferr('evento', name)}</div>`;

  return `<div class="head"><h1>Crear evento 1X2</h1>${tag('HU-05')}</div>
    <p class="lede">Opciones fijas: local, empate y visitante. Horas en hora de Colombia.</p>
    <form class="card stack" data-form="evento" novalidate>
      <div class="field${inv('evento', 'torneoId')}"><label for="e-torneo">Torneo</label><select id="e-torneo" name="torneoId">${torneos.map(t => `<option value="${t.id}" ${val('evento', 'torneoId') === String(t.id) ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select>${ferr('evento', 'torneoId')}</div>
      <div class="grid2">${F('local', 'Equipo local', 'text', '')}${F('visitante', 'Equipo visitante', 'text', '')}</div>
      <div class="grid2">${F('apertura', 'Apertura de pronósticos', 'datetime-local', dt(0))}${F('cierre', 'Cierre de pronósticos', 'datetime-local', dt(2 * 3600e3))}${F('inicio', 'Inicio del partido', 'datetime-local', dt(2.5 * 3600e3))}</div>
      <div class="grid2">${F('costo', 'Costo (créditos)', 'number', '10', 'min="1" step="1"')}${F('premio', 'Premio (créditos)', 'number', '30', 'min="1" step="1"')}</div>
      <div class="row"><button class="btn primary">Registrar evento</button><span class="check">Apertura &lt; cierre ≤ inicio del partido.</span></div>
    </form>`;
};

// ---------- formularios ----------

forms.torneo = async (v) => {
  try {
    const t = await rpc('mp_crear_torneo', {
      p_nombre: v.nombre, p_deporte: v.deporte, p_inicio: v.inicio || null, p_fin: v.fin || null
    });
    ui.form = null;
    ui.flash = { type: 'ok', msg: `Torneo “${t.nombre}” creado en estado programado.` };
  } catch (e) { formError('torneo', v, e); }
};

forms.evento = async (v) => {
  try {
    const e = await rpc('mp_crear_evento', {
      p_torneo_id: v.torneoId ? Number(v.torneoId) : null,
      p_local: v.local, p_visitante: v.visitante,
      p_apertura: aColombia(v.apertura), p_cierre: aColombia(v.cierre), p_inicio: aColombia(v.inicio),
      p_costo: v.costo, p_premio: v.premio
    });
    ui.form = null;
    ui.view = 'torneos';
    ui.flash = { type: 'ok', msg: `Evento ${e.local} vs ${e.visitante} registrado. Estado: ${e.estado}.` };
  } catch (e) { formError('evento', v, e); }
};
