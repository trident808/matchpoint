'use strict';
/*
 * MatchPoint - pronosticos.js
 * Pronósticos y débito de créditos
 * Autor: Integrante 3
 *
 * HU-07  Pronóstico válido en evento abierto
 * HU-08  Débito único sin saldo negativo
 *
 * Notas de diseño:
 *  - Cada intento de pronóstico lleva una llave de idempotencia (idemKey).
 *    Si llega dos veces (reintento tras un corte), se devuelve el resultado
 *    original y NO se debita otra vez.
 *  - Pronóstico, débito y llave se guardan juntos en un solo save():
 *    o queda todo o no queda nada.
 *  - No existe función para editar ni borrar pronósticos (HU-10).
 */

/** Texto legible de una opción del evento. */
function etiquetaOpcion(evento, opcionId) {
  if (opcionId === 'L') return 'Local · ' + evento.local;
  if (opcionId === 'V') return 'Visitante · ' + evento.visitante;
  return 'Empate';
}

/** HU-07 + HU-08 */
function registrarPronostico(req) {
  const usuario = requireRole('participante');

  // 1. ¿Es un reintento de algo que ya quedó registrado?
  const previo = db.idem[req.idemKey];
  if (previo && previo.userId === usuario.id) {
    return { pronostico: db.pronosticos.find(p => p.id === previo.pronosticoId), repetido: true };
  }

  // 2. Validaciones del evento
  cerrarVencidos();
  const evento = db.eventos.find(x => x.id === req.eventoId);
  if (!evento) throw new AppError('El evento no existe.');

  const ahora = Date.now();
  const estado = estadoEvento(evento, ahora);
  if (estado === 'programado') throw new AppError('El periodo de pronósticos de este evento aún no abre.');
  if (estado === 'cerrado') throw new AppError('El periodo de pronósticos ya cerró. Tu pronóstico no se registró.');

  if (!evento.opciones.some(o => o.id === req.opcion)) {
    throw new AppError('Esa opción no pertenece al evento.');
  }
  if (db.pronosticos.some(p => p.userId === usuario.id && p.eventoId === evento.id)) {
    throw new AppError('Ya tienes un pronóstico en este evento.');
  }

  // 3. Saldo suficiente antes de confirmar (nunca negativo)
  const disponible = saldo(usuario.id);
  if (disponible < evento.costo) {
    throw new AppError(`Saldo insuficiente: tienes ${disponible} créditos y el evento cuesta ${evento.costo}. El pronóstico no se registró.`);
  }

  // 4. Registro atómico: pronóstico + débito ligado + llave de idempotencia
  const operacion = nextOp('PR');
  const pronostico = {
    id: uid('P'),
    operacion,
    userId: usuario.id,
    eventoId: evento.id,
    opcion: req.opcion,
    costo: evento.costo,
    fecha: ahora
  };
  db.pronosticos.push(pronostico);
  db.movimientos.push({
    id: uid('M'),
    userId: usuario.id,
    tipo: 'debito',
    cantidad: -evento.costo,
    fecha: ahora,
    autor: usuario.correo,
    operacion,
    pronosticoId: pronostico.id
  });
  db.idem[req.idemKey] = { userId: usuario.id, pronosticoId: pronostico.id };
  save();

  // Prueba de HU-08: la operación quedó hecha pero la respuesta "se pierde"
  if (req.simularFallo) throw new NetworkError();

  return { pronostico, repetido: false };
}

/**
 * Botones 1 / X / 2 y panel de confirmación.
 * torneos.js la llama al pintar cada tarjeta de evento.
 */
function opcionesPronostico(evento, usuario, estado) {
  const esParticipante = usuario.rol === 'participante';
  const mio = esParticipante && db.pronosticos.find(p => p.userId === usuario.id && p.eventoId === evento.id);
  const conf = ui.confirm && ui.confirm.eventoId === evento.id ? ui.confirm : null;
  const reintento = ui.retry && ui.retry.eventoId === evento.id ? ui.retry : null;

  const simbolo = { L: '1', E: 'X', V: '2' };
  const subtitulo = { L: evento.local, E: 'Empate', V: evento.visitante };

  let html = '<div class="opts">';
  for (const o of evento.opciones) {
    const marcado = (mio && mio.opcion === o.id) || (conf && conf.opcion === o.id) || (reintento && reintento.opcion === o.id);
    const bloqueado = !esParticipante || estado !== 'abierto' || mio || reintento;
    html += `<button class="opt${marcado ? ' sel' : ''}" data-action="pick" data-ev="${evento.id}" data-op="${o.id}" ${bloqueado ? 'disabled' : ''}>`
         + `<b>${simbolo[o.id]}</b><span>${esc(subtitulo[o.id])}</span></button>`;
  }
  html += '</div>';

  // El reintento va primero: tras un corte el pronóstico ya existe, pero el usuario aún no lo sabe
  if (reintento) {
    html += `<div class="panel">
      <span class="err">No llegó la confirmación por un corte de conexión.</span>
      <span>Reintentar es seguro: la plataforma reconoce el mismo envío y no cobra dos veces.</span>
      <div class="row"><button class="btn primary" data-action="retry">Reintentar envío</button></div>
    </div>`;
  } else if (mio) {
    html += `<div class="mine">Tu pronóstico: <b>${esc(etiquetaOpcion(evento, mio.opcion))}</b> · operación <span class="mono">${mio.operacion}</span><br>Registrado, no se puede modificar.</div>`;
  } else if (conf && estado === 'abierto') {
    const s = saldo(usuario.id);
    const alcanza = s >= evento.costo;
    html += `<div class="panel">
      <span>Confirmar <b>${esc(etiquetaOpcion(evento, conf.opcion))}</b></span>
      <span class="mono">Costo ${evento.costo} · saldo ${s} → ${alcanza ? 'quedará en ' + (s - evento.costo) : 'no alcanza'}</span>
      ${alcanza ? '' : '<span class="err">Saldo insuficiente. El pronóstico no se registrará.</span>'}
      <label class="check row" style="gap:6px"><input type="checkbox" id="sim-${evento.id}" data-action="sim" style="width:auto" ${conf.simular ? 'checked' : ''}> Simular corte de conexión al enviar (prueba de HU-08)</label>
      <div class="row"><button class="btn primary" data-action="confirm" ${alcanza ? '' : 'disabled'}>Confirmar pronóstico</button><button class="btn" data-action="cancel">Cancelar</button></div>
    </div>`;
  }
  return html;
}

function enviarPronostico(req) {
  try {
    const r = registrarPronostico(req);
    ui.confirm = null;
    ui.retry = null;
    ui.flash = r.repetido
      ? { type: 'ok', msg: `Tu pronóstico ya estaba registrado (operación ${r.pronostico.operacion}). No se hizo un segundo débito.` }
      : { type: 'ok', msg: `Pronóstico registrado. Operación ${r.pronostico.operacion}. Se descontaron ${r.pronostico.costo} créditos.` };
  } catch (e) {
    if (e instanceof NetworkError) {
      ui.confirm = null;
      ui.retry = Object.assign({}, req, { simularFallo: false }); // misma idemKey
      ui.flash = { type: 'bad', msg: 'Se perdió la conexión antes de recibir la confirmación.' };
    } else if (e instanceof AppError) {
      ui.confirm = null;
      ui.flash = { type: 'bad', msg: e.message };
    } else {
      throw e;
    }
  }
}

/* Acciones de la tarjeta */
actions.pick = function (d) {
  ui.confirm = { eventoId: d.ev, opcion: d.op, idemKey: uid('K'), simular: false };
};
actions.sim = function () {
  if (ui.confirm) ui.confirm.simular = !ui.confirm.simular;
};
actions.cancel = function () {
  ui.confirm = null;
};
actions.confirm = function () {
  const c = ui.confirm;
  if (!c) return;
  enviarPronostico({ eventoId: c.eventoId, opcion: c.opcion, idemKey: c.idemKey, simularFallo: c.simular });
};
actions.retry = function () {
  if (ui.retry) enviarPronostico(ui.retry);
};
