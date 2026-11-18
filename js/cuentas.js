/**
 * MatchPoint · cuentas.js
 * Módulo de usuarios, acceso y créditos.
 * Autor: Integrante 1
 *
 * Historias:
 *   HU-01 Registro de participante
 *   HU-02 Inicio de sesión por rol
 *   HU-03 Asignación inicial de créditos
 *   HU-09 Saldo y movimientos verificables
 *
 * Funciones de Supabase que usa (supabase/01_cuentas.sql):
 *   mp_registrar, mp_login, mp_logout, mp_yo,
 *   mp_asignar_inicial, mp_participantes, mp_movimientos
 */

/** HU-02: la sesión vence tras 5 minutos sin actividad (también lo valida el servidor). */
const INACTIVIDAD_MS = 5 * 60 * 1000;
let ultimaActividad = Date.now();

const ROL_NOMBRE = { participante: 'Participante', admin: 'Administrador', auditor: 'Auditor' };
const TIPO_MOV = { asignacion: 'Asignación inicial', debito: 'Débito por pronóstico', premio: 'Premio' };
const NOMBRE_OPCION = { L: 'Local', E: 'Empate', V: 'Visitante' };


/* ------------------------------------------------------------------ */
/*  Sesión                                                            */
/* ------------------------------------------------------------------ */

function registrarActividad() {
  ultimaActividad = Date.now();
}

function sesionVencidaLocal() {
  return getToken() && Date.now() - ultimaActividad > INACTIVIDAD_MS;
}

/** Devuelve el usuario con sesión (y su saldo) o null. */
async function usuarioActual() {
  if (!getToken()) return null;
  if (sesionVencidaLocal()) {
    await cerrarSesion('Tu sesión venció por inactividad. Inicia sesión de nuevo.');
    return null;
  }
  try {
    return await rpc('mp_yo');
  } catch (e) {
    if (e.sesion) {
      setToken(null);
      ui.flash = { type: 'bad', msg: e.message };
      return null;
    }
    throw e;
  }
}

async function cerrarSesion(mensaje) {
  const token = getToken();
  setToken(null);
  ui.confirm = null;
  ui.retry = null;
  if (mensaje) ui.flash = { type: 'bad', msg: mensaje };
  if (token) {
    try { await rpc('mp_logout', { p_token: token }, false); } catch (e) { /* el token ya no sirve */ }
  }
}


/* ------------------------------------------------------------------ */
/*  Pantallas                                                         */
/* ------------------------------------------------------------------ */

function tablaMovimientos(movs) {
  if (movs.length === 0) {
    return '<div class="card">Todavía no hay movimientos. El saldo empieza en 0 hasta la asignación inicial.</div>';
  }
  const filas = movs.map(m => {
    const detalle = m.evento
      ? `${esc(m.evento)} · ${NOMBRE_OPCION[m.opcion] || ''}`
      : `Por ${esc(m.autor)}`;
    const signo = m.cantidad > 0 ? '+' : '';
    return `<tr><td>${fmtFecha(m.fecha)}</td><td>${TIPO_MOV[m.tipo]}</td>
      <td class="num ${m.cantidad > 0 ? 'pos' : 'neg'}">${signo}${m.cantidad}</td>
      <td class="mono">${esc(m.operacion)}</td><td>${detalle}</td></tr>`;
  }).join('');
  return `<div class="scroll"><table><thead><tr><th>Fecha (Colombia)</th><th>Tipo</th><th style="text-align:right">Cantidad</th><th>Operación de origen</th><th>Detalle</th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;
}

/** Panel de marca que acompaña al login y al registro. */
function pantallaAcceso(contenido) {
  return `<div class="auth">
    <aside class="auth-brand">
      <div>
        <span class="eyebrow">Pronósticos deportivos</span>
        <p class="auth-title">Elige local, empate o visitante y sigue cada partido.</p>
      </div>
      <div class="board" aria-hidden="true"><span>1</span><span>X</span><span>2</span></div>
      <ul class="auth-points">
        <li>Los créditos no tienen valor monetario.</li>
        <li>Cada evento se cierra solo a su hora, en hora de Colombia.</li>
        <li>Cada crédito que entra o sale queda registrado.</li>
      </ul>
    </aside>
    <section class="auth-form">${contenido}</section>
  </div>`;
}

views.login = async function () {
  return pantallaAcceso(`
    <div class="stack" style="gap:6px">
      <div class="head"><h1>Iniciar sesión</h1></div>
      <p class="check" style="margin:0">Entra con el correo con el que te registraste.</p>
    </div>
    <form class="stack" data-form="login" novalidate>
      <div class="field"><label for="l-correo">Correo</label><input id="l-correo" name="correo" type="email" autocomplete="username" placeholder="nombre@dominio.co" value="${val('login', 'correo')}"></div>
      <div class="field"><label for="l-pass">Contraseña</label><input id="l-pass" name="password" type="password" autocomplete="current-password"></div>
      <button class="btn primary">Entrar</button>
      <small class="check">La sesión se cierra sola tras 5 minutos sin actividad.</small>
    </form>
    <p class="auth-alt">¿No tienes cuenta? <button type="button" class="textlink" data-action="go" data-view="registro">Regístrate</button></p>`);
};

views.registro = async function () {
  function campo(n, label, type, extra) {
    type = type || 'text';
    const valor = type === 'password' ? '' : `value="${val('registro', n)}"`;
    return `<div class="field${inv('registro', n)}"><label for="r-${n}">${label}</label>
      <input id="r-${n}" name="${n}" type="${type}" ${valor} ${extra || ''}>${ferr('registro', n)}</div>`;
  }
  return pantallaAcceso(`
    <div class="stack" style="gap:6px">
      <div class="head"><h1>Crear cuenta</h1></div>
      <p class="check" style="margin:0">Tu cuenta queda como participante y con saldo 0 hasta que un administrador te asigne los créditos iniciales.</p>
    </div>
    <form class="stack" data-form="registro" novalidate>
      ${campo('nombre', 'Nombre completo', 'text', 'autocomplete="name"')}
      <div class="grid2">${campo('documento', 'Documento de identidad', 'text', 'inputmode="numeric"')}${campo('correo', 'Correo', 'email', 'autocomplete="email"')}</div>
      <div class="grid2">${campo('password', 'Contraseña', 'password', 'autocomplete="new-password"')}${campo('confirmar', 'Confirmar contraseña', 'password', 'autocomplete="new-password"')}</div>
      <button class="btn primary">Crear mi cuenta</button>
    </form>
    <p class="auth-alt">¿Ya tienes cuenta? <button type="button" class="textlink" data-action="go" data-view="login">Inicia sesión</button></p>`);
};

views.saldo = async function (u) {
  const datos = await rpc('mp_movimientos');
  const movs = datos.movimientos;
  const suma = movs.reduce((s, m) => s + m.cantidad, 0);
  return `<div class="head"><h1>Mi saldo</h1></div>
    <div class="card row" style="gap:28px;align-items:flex-end">
      <div><div class="check">Saldo disponible</div><div class="big">${datos.saldo}</div><div class="check">créditos</div></div>
      <div class="check" style="max-width:40ch">Suma de los ${movs.length} movimientos listados: <b class="mono">${suma}</b> ${suma === datos.saldo ? '— coincide con el saldo.' : '— no coincide.'}</div>
    </div>
    <div class="notice"><b>Sin valor monetario.</b> Los créditos solo sirven para participar en las dinámicas de MatchPoint.</div>
    ${tablaMovimientos(movs)}`;
};

views.auditoria = async function () {
  const participantes = await rpc('mp_participantes');
  if (!participantes.some(p => String(p.id) === String(ui.audUser))) {
    ui.audUser = participantes[0] ? participantes[0].id : null;
  }
  const datos = ui.audUser ? await rpc('mp_movimientos', { p_usuario_id: ui.audUser }) : { saldo: 0, movimientos: [] };
  const opciones = participantes.length
    ? participantes.map(p => `<option value="${p.id}" ${String(p.id) === String(ui.audUser) ? 'selected' : ''}>${esc(p.nombre)} · ${esc(p.correo)}</option>`).join('')
    : '<option value="">Aún no hay participantes</option>';
  return `<div class="head"><h1>Auditoría de movimientos</h1></div>
    <div class="card row"><div class="field" style="flex:1;min-width:220px"><label for="aud-user">Participante</label>
      <select id="aud-user" data-change="aud">${opciones}</select></div>
      <div><div class="check">Saldo</div><div class="big" style="font-size:40px">${datos.saldo}</div></div></div>
    ${tablaMovimientos(datos.movimientos)}`;
};

views.creditos = async function () {
  const participantes = await rpc('mp_participantes');
  const pendientes = participantes.filter(p => !p.asignacion);

  const opciones = pendientes.length
    ? pendientes.map(p => `<option value="${p.id}">${esc(p.nombre)} · ${esc(p.correo)}</option>`).join('')
    : '<option value="">Todos ya tienen su asignación</option>';

  const filas = participantes.length ? participantes.map(p => {
    const a = p.asignacion;
    const estado = a
      ? `+${a.cantidad} el ${fmtFecha(a.fecha)} por ${esc(a.autor)} <span class="mono">${esc(a.operacion)}</span>`
      : '<span class="chip programado">Pendiente</span>';
    return `<tr><td>${esc(p.nombre)}</td><td>${esc(p.correo)}</td><td>${estado}</td></tr>`;
  }).join('') : '<tr><td colspan="3">Aún no hay participantes registrados.</td></tr>';

  return `<div class="head"><h1>Asignación inicial de créditos</h1></div>
    <div class="notice"><b>Los créditos no tienen valor monetario.</b> No se compran, no se venden y no se cambian por dinero.</div>
    <form class="card row" data-form="asignar" novalidate style="align-items:flex-end">
      <div class="field${inv('asignar', 'participante')}" style="flex:2;min-width:220px"><label for="a-part">Participante sin asignación</label>
        <select id="a-part" name="participante">${opciones}</select>${ferr('asignar', 'participante')}</div>
      <div class="field${inv('asignar', 'cantidad')}" style="flex:1;min-width:120px"><label for="a-cant">Créditos</label><input id="a-cant" name="cantidad" type="number" min="1" step="1" value="${val('asignar', 'cantidad', '100')}">${ferr('asignar', 'cantidad')}</div>
      <button class="btn primary" ${pendientes.length ? '' : 'disabled'}>Asignar créditos</button>
    </form>
    <div class="scroll"><table><thead><tr><th>Participante</th><th>Correo</th><th>Asignación inicial</th></tr></thead><tbody>${filas}</tbody></table></div>`;
};


/* ------------------------------------------------------------------ */
/*  Formularios y acciones                                            */
/* ------------------------------------------------------------------ */

forms.login = async function (v) {
  try {
    const r = await rpc('mp_login', { p_correo: v.correo, p_clave: v.password }, false);
    setToken(r.token);
    registrarActividad();
    ui.form = null;
    ui.view = 'torneos';
  } catch (e) {
    formError('login', v, e);
  }
};

forms.registro = async function (v) {
  // Revisión rápida en la página; el servidor vuelve a validar todo
  if (v.password !== v.confirmar) {
    formError('registro', v, new AppError('Revisa los campos marcados.', { confirmar: 'Las contraseñas no coinciden.' }));
    return;
  }
  try {
    const r = await rpc('mp_registrar', {
      p_nombre: v.nombre, p_documento: v.documento, p_correo: v.correo, p_clave: v.password
    }, false);
    ui.view = 'login';
    ui.form = { name: 'login', values: { correo: r.correo }, fields: {} };
    ui.flash = { type: 'ok', msg: `Cuenta creada para ${r.correo} con rol participante y saldo 0. Ya puedes iniciar sesión.` };
  } catch (e) {
    formError('registro', v, e);
  }
};

forms.asignar = async function (v) {
  try {
    const r = await rpc('mp_asignar_inicial', { p_usuario_id: v.participante ? Number(v.participante) : null, p_cantidad: v.cantidad });
    ui.form = null;
    ui.flash = { type: 'ok', msg: `Asignación registrada: +${r.cantidad} créditos, operación ${r.operacion}.` };
  } catch (e) {
    formError('asignar', v, e);
  }
};

actions.logout = async function () {
  await cerrarSesion();
  ui.flash = { type: 'ok', msg: 'Sesión cerrada.' };
};
