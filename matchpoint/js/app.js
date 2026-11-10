/* ==========================================================================
   MatchPoint · app.js
   Integración: junta los módulos de cuentas, torneos y pronósticos.
   Menú por rol, enrutador de pantallas, eventos del DOM,
   temporizadores y datos de prueba.
   ========================================================================== */

function navFor(u) {
  if (!u) return [['login', 'Iniciar sesión'], ['registro', 'Registrarme']];
  if (u.rol === 'participante') return [['torneos', 'Torneos y eventos'], ['saldo', 'Mi saldo']];
  if (u.rol === 'admin') return [['torneos', 'Torneos y eventos'], ['nuevoTorneo', 'Crear torneo'], ['nuevoEvento', 'Crear evento'], ['creditos', 'Créditos iniciales']];
  return [['torneos', 'Torneos y eventos'], ['auditoria', 'Auditoría']];
}

function header(u, nav) {
  const quien = u
    ? `<b>${esc(u.nombre)}</b><span class="role">${ROL_NOMBRE[u.rol]}</span><button class="linkbtn" data-action="logout">Cerrar sesión</button>`
    : 'Sin sesión';
  const tabs = nav.map(([id, l]) => `<button class="tab" data-action="go" data-view="${id}" ${ui.view === id ? 'aria-current="page"' : ''}>${l}</button>`).join('');
  return `<header class="bar gut"><div class="inner">
    <div class="mark">Match<span>Point</span></div>
    <div class="who">${quien}</div>
    <nav class="tabs" aria-label="Secciones">${tabs}</nav>
  </div></header>`;
}

const app = document.getElementById('app');

function render() {
  const u = currentUser();
  const nav = navFor(u);
  if (!nav.some(([id]) => id === ui.view)) ui.view = nav[0][0];
  let body;
  try {
    body = views[ui.view](u);
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    body = `<div class="flash bad">${esc(e.message)}</div>`;
  }
  const fl = ui.flash ? `<div class="flash ${ui.flash.type}" role="status">${esc(ui.flash.msg)}</div>` : '';
  app.innerHTML = header(u, nav) + `<main class="gut"><div class="inner">${fl}${body}</div></main>`;
}

actions.go = function (d) {
  ui.view = d.view;
  ui.form = null;
  ui.confirm = ui.retry = null;
};

// --- Eventos del DOM ---
function activity() {
  if (sesionVencida()) { currentUser(); render(); }
  else if (db.session) { db.session.last = Date.now(); save(); }
}
document.addEventListener('pointerdown', activity, true);
document.addEventListener('keydown', activity, true);

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-action]');
  if (!b) return;
  if (b.tagName === 'BUTTON') ev.preventDefault();
  ui.flash = null;
  const r = await actions[b.dataset.action](b.dataset);
  if (r !== 'norender') render();
});

document.addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target;
  ui.flash = null;
  await forms[f.dataset.form](Object.fromEntries(new FormData(f)));
  render();
});

document.addEventListener('change', ev => {
  if (ev.target.dataset.change === 'aud') { ui.audUser = ev.target.value; render(); }
});

// Cada 10 s: vencimiento de sesión (HU-02) y cierre automático de eventos (HU-10)
setInterval(() => {
  if (sesionVencida()) { currentUser(); render(); return; }
  if (cerrarVencidos() && ui.view === 'torneos') render();
}, 10000);

// --- Datos de prueba (fechas relativas a "ahora" para tener eventos en cada estado) ---
async function seed() {
  const n = Date.now(), H = 3600e3, D = 24 * H;
  const mk = async (nombre, correo, pass, rol, doc) => {
    const u = { id: uid('U'), nombre, documento: doc, correo, hash: await hash(pass), rol, creado: n - 5 * D };
    db.users.push(u);
    return u;
  };
  await mk('Admin MatchPoint', 'admin@matchpoint.co', 'Admin2026', 'admin', '1000000001');
  await mk('Auditoría Interna', 'auditor@matchpoint.co', 'Audit2026', 'auditor', '1000000002');
  const laura = await mk('Laura Gómez', 'laura@demo.co', 'Demo2026', 'participante', '1020304050');
  await mk('Andrés Rincón', 'andres@demo.co', 'Demo2026', 'participante', '1098765432');

  const t = { id: uid('T'), nombre: 'Liga BetPlay 2026-II · Cuadrangulares', deporte: 'Fútbol', inicio: colISO(n).slice(0, 10), fin: colISO(n + 30 * D).slice(0, 10), estado: 'programado', creadoPor: 'admin@matchpoint.co', creado: n - 3 * D };
  db.torneos.push(t);

  const ev = (local, visitante, ap, ci, ini, costo, premio) => {
    const e = { id: uid('E'), torneoId: t.id, local, visitante, opciones: OPCIONES_1X2.map(o => ({ ...o })), apertura: n + ap, cierre: n + ci, inicio: n + ini, costo, premio };
    e.estado = estadoEvento(e);
    db.eventos.push(e);
    return e;
  };
  ev('Millonarios', 'Atlético Nacional', -D, 2 * H, 2.25 * H, 10, 30);
  ev('Once Caldas', 'Bucaramanga', -H, 4 * 60e3, 20 * 60e3, 5, 15);
  const cerrado = ev('América de Cali', 'Junior', -2 * D, -H, -0.5 * H, 10, 30);
  ev('Santa Fe', 'Deportes Tolima', D, 3 * D, 3 * D + 0.5 * H, 15, 45);

  db.movimientos.push({ id: uid('M'), userId: laura.id, tipo: 'asignacion', cantidad: 100, fecha: n - 4 * D, autor: 'admin@matchpoint.co', operacion: nextOp('AS') });
  const op = nextOp('PR');
  const p = { id: uid('P'), operacion: op, userId: laura.id, eventoId: cerrado.id, opcion: 'L', costo: 10, fecha: n - 1.5 * D };
  db.pronosticos.push(p);
  db.movimientos.push({ id: uid('M'), userId: laura.id, tipo: 'debito', cantidad: -10, fecha: p.fecha, autor: laura.correo, operacion: op, pronosticoId: p.id });
  save();
}

(async function init() {
  db = load();
  if (!db || !db.users) { db = emptyDb(); await seed(); }
  render();
})();
