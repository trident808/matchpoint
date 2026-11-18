/* ==========================================================================
   MatchPoint · app.js
   Integración: junta los módulos de cuentas, torneos y pronósticos.
   Menú por rol, enrutador de pantallas, eventos de la página y temporizadores.
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
let renderSeq = 0;

async function render() {
  const seq = ++renderSeq;
  let u = null, nav, body;
  try {
    u = await usuarioActual();
    nav = navFor(u);
    if (!nav.some(([id]) => id === ui.view)) ui.view = nav[0][0];
    body = await views[ui.view](u);
  } catch (e) {
    if (e.sesion) { setToken(null); ui.flash = { type: 'bad', msg: e.message }; return render(); }
    if (!(e instanceof AppError) && !(e instanceof NetworkError)) throw e;
    nav = nav || navFor(u);
    body = `<div class="flash bad">${esc(e.message)}</div>`;
  }
  if (seq !== renderSeq) return;   // llegó una pantalla más nueva
  const fl = ui.flash ? `<div class="flash ${ui.flash.type}" role="status">${esc(ui.flash.msg)}</div>` : '';
  app.innerHTML = header(u, nav) + `<main class="gut"><div class="inner">${fl}${body}</div></main>`;
}

actions.go = function (d) {
  ui.view = d.view;
  ui.form = null;
  ui.confirm = ui.retry = null;
};

// --- Eventos de la página ---
document.addEventListener('pointerdown', registrarActividad, true);
document.addEventListener('keydown', registrarActividad, true);

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-action]');
  if (!b || ui.busy) return;
  if (b.tagName === 'BUTTON') ev.preventDefault();
  ui.busy = true;
  b.setAttribute('aria-busy', 'true');
  try {
    ui.flash = null;
    const r = await actions[b.dataset.action](b.dataset);
    if (r !== 'norender') await render();
  } finally {
    ui.busy = false;
    b.removeAttribute('aria-busy');
  }
});

document.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (ui.busy) return;
  const f = ev.target;
  const btn = f.querySelector('button.primary');
  ui.busy = true;
  if (btn) btn.setAttribute('aria-busy', 'true');
  try {
    ui.flash = null;
    await forms[f.dataset.form](Object.fromEntries(new FormData(f)));
    await render();
  } finally {
    ui.busy = false;
  }
});

document.addEventListener('change', ev => {
  if (ev.target.dataset.change === 'aud') { ui.audUser = ev.target.value; render(); }
});

// Cada 30 s: vencimiento de sesión (HU-02) y cierre automático en pantalla (HU-10)
setInterval(async () => {
  if (ui.busy) return;
  if (sesionVencidaLocal()) {
    await cerrarSesion('Tu sesión venció por inactividad. Inicia sesión de nuevo.');
    render();
    return;
  }
  if (ui.view === 'torneos' && getToken() && !ui.confirm && !ui.retry) render();
}, 30000);

render();
