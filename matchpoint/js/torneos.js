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
//  Usa de cuentas.js:     requireRole, saldo
//  Usa de pronosticos.js: opcionesPronostico (si está cargado)
// ============================================================

const DEPORTES = ['Fútbol', 'Baloncesto', 'Voleibol', 'Fútbol sala'];
const OPCIONES_1X2 = [
  { id: 'L', nombre: 'Local' },
  { id: 'E', nombre: 'Empate' },
  { id: 'V', nombre: 'Visitante' }
];

// ---------- reglas de negocio ----------

// HU-04
const crearTorneo = (d) => {
  const u = requireRole('admin');
  const f = {};
  const nombre = (d.nombre || '').trim();

  if (nombre.length < 3) f.nombre = 'Escribe un nombre de al menos 3 caracteres.';
  if (!DEPORTES.includes(d.deporte)) f.deporte = 'Elige un deporte.';
  if (!d.inicio) f.inicio = 'Indica la fecha de inicio.';
  if (!d.fin) f.fin = 'Indica la fecha de fin.';
  if (d.inicio && d.fin && d.fin < d.inicio) f.fin = 'La fecha de fin no puede ser anterior a la de inicio.';
  if (Object.keys(f).length) throw new AppError('Revisa los campos marcados.', f);

  const t = { id: uid('T'), nombre, deporte: d.deporte, inicio: d.inicio, fin: d.fin, estado: 'programado', creadoPor: u.correo, creado: Date.now() };
  db.torneos.push(t);
  save();
  return t;
};

// HU-05
const crearEvento = (d) => {
  requireRole('admin');
  const f = {};
  const t = db.torneos.find(x => x.id === d.torneoId);
  const local = (d.local || '').trim();
  const visitante = (d.visitante || '').trim();
  const inicio = parseCol(d.inicio);
  const apertura = parseCol(d.apertura);
  const cierre = parseCol(d.cierre);

  if (!t) f.torneoId = 'Elige un torneo.';
  if (!local) f.local = 'Escribe el equipo local.';
  if (!visitante) f.visitante = 'Escribe el equipo visitante.';
  if (local && local.toLowerCase() === visitante.toLowerCase()) f.visitante = 'Local y visitante deben ser distintos.';
  if (isNaN(inicio)) f.inicio = 'Indica el inicio del partido.';
  if (isNaN(apertura)) f.apertura = 'Indica la apertura.';
  if (isNaN(cierre)) f.cierre = 'Indica el cierre.';
  // apertura < cierre <= inicio del partido
  if (!f.apertura && !f.cierre && apertura >= cierre) f.cierre = 'El cierre debe ser posterior a la apertura.';
  if (!f.cierre && !f.inicio && cierre > inicio) f.cierre = 'El cierre no puede superar el inicio del partido.';
  if (!/^\d+$/.test(d.costo || '') || +d.costo <= 0) f.costo = 'Entero positivo.';
  if (!/^\d+$/.test(d.premio || '') || +d.premio <= 0) f.premio = 'Entero positivo.';
  if (Object.keys(f).length) throw new AppError('Revisa los campos marcados.', f);

  const e = {
    id: uid('E'), torneoId: t.id, local, visitante,
    opciones: OPCIONES_1X2.map(o => ({ ...o })),
    inicio, apertura, cierre,
    costo: +d.costo, premio: +d.premio
  };
  e.estado = estadoEvento(e);
  db.eventos.push(e);
  save();
  return e;
};

// Estado según la hora actual: programado -> abierto -> cerrado
const estadoEvento = (e, now = Date.now()) => {
  if (now < e.apertura) return 'programado';
  if (now < e.cierre) return 'abierto';
  return 'cerrado';
};

// HU-10: se llama en cada acción y cada 10 s desde app.js
const cerrarVencidos = () => {
  let cambio = false;
  db.eventos.forEach(e => {
    const s = estadoEvento(e);
    if (s !== e.estado) {
      if (s === 'cerrado') e.cerradoEn = e.cierre;
      e.estado = s;
      cambio = true;
    }
  });
  if (cambio) save();
  return cambio;
};

// HU-06
const listarTorneos = () => {
  cerrarVencidos();
  return db.torneos.map(t => ({
    ...t,
    eventos: db.eventos.filter(e => e.torneoId === t.id).sort((a, b) => a.inicio - b.inicio)
  }));
};

// ---------- vistas ----------

const tarjetaEvento = (e, u) => {
  const st = estadoEvento(e);
  let cuerpo;

  if (st === 'cerrado') {
    cuerpo = `<div class="optlist">Opciones: ${esc(e.local)} · Empate · ${esc(e.visitante)}<br>Cerrado: ya no admite pronósticos.</div>`;
  } else if (typeof opcionesPronostico === 'function') {
    cuerpo = opcionesPronostico(e, u, st);          // lo pone el módulo de pronósticos
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

views.torneos = (u) => {
  const ts = listarTorneos();
  const aviso = u.rol === 'participante'
    ? `<div class="notice">Tu saldo: <b>${saldo(u.id)} créditos</b>. Los créditos de MatchPoint no tienen valor monetario.</div>`
    : '';

  const secciones = ts.length
    ? ts.map(t => `<section class="torneo">
        <div class="torneo-head"><h2>${esc(t.nombre)}</h2><span class="meta">${esc(t.deporte)} · ${fmtDia(t.inicio)} – ${fmtDia(t.fin)}</span><span class="chip programado">${t.estado}</span></div>
        ${t.eventos.length ? `<div class="events">${t.eventos.map(e => tarjetaEvento(e, u)).join('')}</div>` : '<p class="check">Este torneo todavía no tiene eventos.</p>'}
      </section>`).join('')
    : '<div class="card">Aún no hay torneos. Un administrador puede crearlos en “Crear torneo”.</div>';

  return `<div class="head"><h1>Torneos y eventos</h1>${tag('HU-06')}${tag('HU-10')}</div>
    <p class="lede">Horas en hora de Colombia (UTC−5). Cada evento se cierra solo al llegar su hora de cierre.</p>
    ${aviso}${secciones}`;
};

views.nuevoTorneo = () => {
  requireRole('admin');
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

views.nuevoEvento = () => {
  requireRole('admin');
  if (!db.torneos.length) {
    return `<div class="head"><h1>Crear evento 1X2</h1>${tag('HU-05')}</div><div class="card">Primero crea un torneo.</div>`;
  }
  const n = Date.now();
  const dt = ms => colISO(n + ms).slice(0, 16);
  const F = (name, label, type, def, extra = '') =>
    `<div class="field${inv('evento', name)}"><label for="e-${name}">${label}</label><input id="e-${name}" name="${name}" type="${type}" value="${val('evento', name, def)}" ${extra}>${ferr('evento', name)}</div>`;

  return `<div class="head"><h1>Crear evento 1X2</h1>${tag('HU-05')}</div>
    <p class="lede">Opciones fijas: local, empate y visitante. Horas en hora de Colombia.</p>
    <form class="card stack" data-form="evento" novalidate>
      <div class="field${inv('evento', 'torneoId')}"><label for="e-torneo">Torneo</label><select id="e-torneo" name="torneoId">${db.torneos.map(t => `<option value="${t.id}" ${val('evento', 'torneoId') === t.id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select>${ferr('evento', 'torneoId')}</div>
      <div class="grid2">${F('local', 'Equipo local', 'text', '')}${F('visitante', 'Equipo visitante', 'text', '')}</div>
      <div class="grid2">${F('apertura', 'Apertura de pronósticos', 'datetime-local', dt(0))}${F('cierre', 'Cierre de pronósticos', 'datetime-local', dt(2 * 3600e3))}${F('inicio', 'Inicio del partido', 'datetime-local', dt(2.5 * 3600e3))}</div>
      <div class="grid2">${F('costo', 'Costo (créditos)', 'number', '10', 'min="1" step="1"')}${F('premio', 'Premio (créditos)', 'number', '30', 'min="1" step="1"')}</div>
      <div class="row"><button class="btn primary">Registrar evento</button><span class="check">Apertura &lt; cierre ≤ inicio del partido.</span></div>
    </form>`;
};

// ---------- formularios ----------

forms.torneo = (v) => {
  try {
    const t = crearTorneo(v);
    ui.form = null;
    ui.flash = { type: 'ok', msg: `Torneo “${t.nombre}” creado en estado programado.` };
  } catch (e) { formError('torneo', v, e); }
};

forms.evento = (v) => {
  try {
    const e = crearEvento(v);
    ui.form = null;
    ui.view = 'torneos';
    ui.flash = { type: 'ok', msg: `Evento ${e.local} vs ${e.visitante} registrado. Estado: ${e.estado}.` };
  } catch (e) { formError('evento', v, e); }
};
