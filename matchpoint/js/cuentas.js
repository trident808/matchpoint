/**
 * MatchPoint · cuentas.js
 * Módulo de cuentas, acceso y créditos.
 * Autor: Integrante 1
 *
 * Historias:
 *   HU-01 Registro de participante
 *   HU-02 Inicio de sesión por rol
 *   HU-03 Asignación inicial de créditos
 *   HU-09 Saldo y movimientos verificables
 *
 * Expone a los demás módulos: currentUser(), requireRole(), saldo()
 */

/** HU-02: la sesión vence tras 5 minutos sin actividad. */
const INACTIVIDAD_MS = 5 * 60 * 1000;

const ROL_NOMBRE = { participante: 'Participante', admin: 'Administrador', auditor: 'Auditor' };
const TIPO_MOV = { asignacion: 'Asignación inicial', debito: 'Débito por pronóstico', premio: 'Premio' };


/* ------------------------------------------------------------------ */
/*  Lógica                                                            */
/* ------------------------------------------------------------------ */

/**
 * HU-01. Registra un participante nuevo.
 * Valida campos obligatorios y correo único. La cuenta queda sin créditos.
 */
async function registrarParticipante(datos) {
  const errores = {};
  const nombre = (datos.nombre || '').trim();
  const correo = (datos.correo || '').trim().toLowerCase();

  if (nombre.length < 3) {
    errores.nombre = 'Escribe tu nombre completo (mínimo 3 letras).';
  }
  if (!/^\d{6,10}$/.test((datos.documento || '').trim())) {
    errores.documento = 'El documento debe tener entre 6 y 10 dígitos, sin puntos.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) {
    errores.correo = 'Escribe un correo válido, por ejemplo nombre@dominio.co.';
  }
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(datos.password || '')) {
    errores.password = 'Mínimo 8 caracteres, con al menos una letra y un número.';
  }
  if (datos.password !== datos.confirmar) {
    errores.confirmar = 'Las contraseñas no coinciden.';
  }
  if (!errores.correo && db.users.some(u => u.correo === correo)) {
    errores.correo = 'Ya existe una cuenta con este correo.';
  }
  if (Object.keys(errores).length > 0) {
    throw new AppError('Revisa los campos marcados.', errores);
  }

  const usuario = {
    id: uid('U'),
    nombre: nombre,
    documento: datos.documento.trim(),
    correo: correo,
    hash: await hash(datos.password),
    rol: 'participante',
    creado: Date.now()
  };
  db.users.push(usuario);
  save(); // sin movimientos: saldo 0 hasta la asignación inicial
  return usuario;
}

/**
 * HU-02. Inicia sesión. El mensaje de error es el mismo
 * si falla el correo o la contraseña, para no revelar cuál.
 */
async function iniciarSesion(correo, password) {
  const usuario = db.users.find(u => u.correo === (correo || '').trim().toLowerCase());
  const h = await hash(password || '');
  if (!usuario || usuario.hash !== h) {
    throw new AppError('Correo o contraseña incorrectos.');
  }
  db.session = { userId: usuario.id, last: Date.now() };
  save();
  return usuario;
}

function cerrarSesion(mensaje) {
  db.session = null;
  save();
  ui.confirm = null;
  ui.retry = null;
  if (mensaje) ui.flash = { type: 'bad', msg: mensaje };
}

function sesionVencida() {
  return db.session && Date.now() - db.session.last > INACTIVIDAD_MS;
}

function currentUser() {
  if (sesionVencida()) {
    cerrarSesion('Tu sesión venció por inactividad. Inicia sesión de nuevo.');
  }
  if (!db.session) return null;
  return db.users.find(u => u.id === db.session.userId) || null;
}

/** HU-02. Bloquea funciones que no corresponden al rol del usuario. */
function requireRole(...roles) {
  const usuario = currentUser();
  if (!usuario) throw new AppError('Inicia sesión para continuar.');
  if (!roles.includes(usuario.rol)) throw new AppError('No tienes permiso para usar esta función.');
  return usuario;
}

/**
 * HU-03. Asignación inicial de créditos.
 * Deja un movimiento con autor y fecha. No se puede aplicar dos veces.
 */
function asignarInicial(userId, cantidadTxt) {
  const admin = requireRole('admin');
  const participante = db.users.find(u => u.id === userId && u.rol === 'participante');

  if (!participante) {
    throw new AppError('Elige un participante.', { participante: 'Elige un participante.' });
  }
  if (!/^\d+$/.test(String(cantidadTxt)) || Number(cantidadTxt) <= 0) {
    throw new AppError('La cantidad debe ser un entero positivo.', { cantidad: 'Entero positivo.' });
  }
  const yaTiene = db.movimientos.some(m => m.userId === userId && m.tipo === 'asignacion');
  if (yaTiene) {
    throw new AppError(`${participante.nombre} ya recibió su asignación inicial. No se aplica dos veces.`);
  }

  const movimiento = {
    id: uid('M'),
    userId: userId,
    tipo: 'asignacion',
    cantidad: Number(cantidadTxt),
    fecha: Date.now(),
    autor: admin.correo,
    operacion: nextOp('AS')
  };
  db.movimientos.push(movimiento);
  save();
  return movimiento;
}

/** HU-09. El saldo siempre se calcula como la suma de los movimientos. */
function saldo(userId) {
  return db.movimientos
    .filter(m => m.userId === userId)
    .reduce((total, m) => total + m.cantidad, 0);
}

/** HU-09. Solo el titular y los auditores pueden ver los movimientos. */
function verMovimientos(userId) {
  const usuario = requireRole('participante', 'auditor');
  if (usuario.rol === 'participante' && usuario.id !== userId) {
    throw new AppError('Solo puedes ver tus propios movimientos.');
  }
  return db.movimientos
    .filter(m => m.userId === userId)
    .sort((a, b) => b.fecha - a.fecha);
}


/* ------------------------------------------------------------------ */
/*  Pantallas                                                         */
/* ------------------------------------------------------------------ */

function tablaMovimientos(movs) {
  if (movs.length === 0) {
    return '<div class="card">Todavía no hay movimientos. El saldo empieza en 0 hasta la asignación inicial.</div>';
  }
  const filas = movs.map(m => {
    let detalle = '';
    if (m.tipo === 'debito') {
      const p = db.pronosticos.find(x => x.id === m.pronosticoId);
      const e = p && db.eventos.find(x => x.id === p.eventoId);
      detalle = e ? `${esc(e.local)} vs ${esc(e.visitante)} · ${esc(etiquetaOpcion(e, p.opcion))}` : '';
    } else {
      detalle = `Por ${esc(m.autor)}`;
    }
    const signo = m.cantidad > 0 ? '+' : '';
    return `<tr><td>${fmtFecha(m.fecha)}</td><td>${TIPO_MOV[m.tipo]}</td>
      <td class="num ${m.cantidad > 0 ? 'pos' : 'neg'}">${signo}${m.cantidad}</td>
      <td class="mono">${m.operacion}</td><td>${detalle}</td></tr>`;
  }).join('');
  return `<div class="scroll"><table><thead><tr><th>Fecha (Colombia)</th><th>Tipo</th><th style="text-align:right">Cantidad</th><th>Operación de origen</th><th>Detalle</th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;
}

views.login = function () {
  const demo = [
    ['laura@demo.co', 'Demo2026', 'Participante con 100 créditos'],
    ['andres@demo.co', 'Demo2026', 'Participante sin asignación'],
    ['admin@matchpoint.co', 'Admin2026', 'Administrador de torneos'],
    ['auditor@matchpoint.co', 'Audit2026', 'Auditor']
  ];
  return `<div class="head"><h1>Iniciar sesión</h1>${tag('HU-02')}</div>
  <div class="split">
    <form class="card stack" data-form="login" novalidate>
      <div class="field"><label for="l-correo">Correo</label><input id="l-correo" name="correo" type="email" autocomplete="username" value="${val('login', 'correo')}"></div>
      <div class="field"><label for="l-pass">Contraseña</label><input id="l-pass" name="password" type="password" autocomplete="current-password"></div>
      <div class="row"><button class="btn primary">Entrar</button><button type="button" class="btn" data-action="go" data-view="registro">Crear una cuenta</button></div>
      <small class="check">La sesión se cierra sola tras 5 minutos sin actividad.</small>
    </form>
    <div class="card demo"><b>Cuentas de prueba</b><span class="check">Toca una para llenar el formulario.</span>
      ${demo.map(([c, p, d]) => `<button type="button" data-action="fill" data-c="${c}" data-p="${p}"><span class="mono">${c}</span><br><span class="check">${d} · clave ${p}</span></button>`).join('')}
    </div>
  </div>`;
};

views.registro = function () {
  function campo(n, label, type, extra) {
    type = type || 'text';
    const valor = type === 'password' ? '' : `value="${val('registro', n)}"`;
    return `<div class="field${inv('registro', n)}"><label for="r-${n}">${label}</label>
      <input id="r-${n}" name="${n}" type="${type}" ${valor} ${extra || ''}>${ferr('registro', n)}</div>`;
  }
  return `<div class="head"><h1>Registro de participante</h1>${tag('HU-01')}</div>
  <p class="lede">Tu cuenta queda con rol participante y saldo 0 hasta que un administrador haga la asignación inicial de créditos.</p>
  <form class="card stack" data-form="registro" novalidate>
    <div class="grid2">${campo('nombre', 'Nombre completo', 'text', 'autocomplete="name"')}${campo('documento', 'Documento de identidad', 'text', 'inputmode="numeric"')}</div>
    ${campo('correo', 'Correo', 'email', 'autocomplete="email"')}
    <div class="grid2">${campo('password', 'Contraseña', 'password', 'autocomplete="new-password"')}${campo('confirmar', 'Confirmar contraseña', 'password', 'autocomplete="new-password"')}</div>
    <div class="row"><button class="btn primary">Registrarme</button></div>
  </form>`;
};

views.saldo = function (u) {
  const movs = verMovimientos(u.id);
  const suma = movs.reduce((s, m) => s + m.cantidad, 0);
  const actual = saldo(u.id);
  return `<div class="head"><h1>Mi saldo</h1>${tag('HU-09')}</div>
    <div class="card row" style="gap:28px;align-items:flex-end">
      <div><div class="check">Saldo disponible</div><div class="big">${actual}</div><div class="check">créditos</div></div>
      <div class="check" style="max-width:40ch">Suma de los ${movs.length} movimientos listados: <b class="mono">${suma}</b> ${suma === actual ? '— coincide con el saldo.' : '— no coincide.'}</div>
    </div>
    <div class="notice"><b>Sin valor monetario.</b> Los créditos solo sirven para participar en las dinámicas de MatchPoint.</div>
    ${tablaMovimientos(movs)}`;
};

views.auditoria = function () {
  requireRole('auditor');
  const participantes = db.users.filter(x => x.rol === 'participante');
  if (!ui.audUser && participantes[0]) ui.audUser = participantes[0].id;
  const movs = ui.audUser ? verMovimientos(ui.audUser) : [];
  return `<div class="head"><h1>Auditoría de movimientos</h1>${tag('HU-09')}</div>
    <div class="card row"><div class="field" style="flex:1;min-width:220px"><label for="aud-user">Participante</label>
      <select id="aud-user" data-change="aud">${participantes.map(p => `<option value="${p.id}" ${p.id === ui.audUser ? 'selected' : ''}>${esc(p.nombre)} · ${esc(p.correo)}</option>`).join('')}</select></div>
      <div><div class="check">Saldo</div><div class="big" style="font-size:40px">${ui.audUser ? saldo(ui.audUser) : 0}</div></div></div>
    ${tablaMovimientos(movs)}`;
};

views.creditos = function () {
  requireRole('admin');
  const participantes = db.users.filter(x => x.rol === 'participante');
  const asignacionDe = id => db.movimientos.find(m => m.userId === id && m.tipo === 'asignacion');
  const pendientes = participantes.filter(p => !asignacionDe(p.id));

  const opciones = pendientes.length
    ? pendientes.map(p => `<option value="${p.id}">${esc(p.nombre)} · ${esc(p.correo)}</option>`).join('')
    : '<option value="">Todos ya tienen su asignación</option>';

  const filas = participantes.map(p => {
    const a = asignacionDe(p.id);
    const estado = a
      ? `Hecha el ${fmtFecha(a.fecha)} por ${esc(a.autor)} <span class="mono">${a.operacion}</span>`
      : '<span class="chip programado">Pendiente</span>';
    return `<tr><td>${esc(p.nombre)}</td><td>${esc(p.correo)}</td><td>${estado}</td></tr>`;
  }).join('');

  return `<div class="head"><h1>Asignación inicial de créditos</h1>${tag('HU-03')}</div>
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
    await iniciarSesion(v.correo, v.password);
    ui.form = null;
    ui.view = 'torneos';
  } catch (e) {
    formError('login', v, e);
  }
};

forms.registro = async function (v) {
  try {
    const u = await registrarParticipante(v);
    ui.view = 'login';
    ui.form = { name: 'login', values: { correo: u.correo }, fields: {} };
    ui.flash = { type: 'ok', msg: `Cuenta creada para ${u.correo} con rol participante y saldo 0. Ya puedes iniciar sesión.` };
  } catch (e) {
    formError('registro', v, e);
  }
};

forms.asignar = function (v) {
  try {
    const m = asignarInicial(v.participante, v.cantidad);
    ui.form = null;
    ui.flash = { type: 'ok', msg: `Asignación registrada: +${m.cantidad} créditos, operación ${m.operacion}.` };
  } catch (e) {
    formError('asignar', v, e);
  }
};

actions.logout = function () {
  cerrarSesion();
  ui.flash = { type: 'ok', msg: 'Sesión cerrada.' };
};

actions.fill = function (d) {
  ui.form = { name: 'login', values: { correo: d.c }, fields: {} };
  render();
  const pass = document.getElementById('l-pass');
  if (pass) pass.value = d.p;
  return 'norender';
};
