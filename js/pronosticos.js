'use strict';
/*
 * MatchPoint - pronosticos.js
 * Pronósticos y débito de créditos
 * Autor: Integrante 3
 *
 * HU-07  Pronóstico válido en evento abierto
 * HU-08  Débito único sin saldo negativo
 *
 * Funciones de Supabase (supabase/03_pronosticos.sql):
 *   mp_registrar_pronostico, mp_mis_pronosticos
 *
 * Notas de diseño:
 *  - Cada intento de pronóstico lleva una llave única (idemKey). Si el
 *    envío se repite (reintento tras un corte), el servidor devuelve el
 *    resultado original y NO debita otra vez.
 *  - Las validaciones de periodo, opción, saldo y pronóstico único las
 *    hace el servidor dentro de una transacción.
 */

/** Pronósticos del participante, indexados por evento. */
async function cargarMisPronosticos() {
  const lista = await rpc('mp_mis_pronosticos');
  const porEvento = {};
  lista.forEach(p => { porEvento[p.evento_id] = p; });
  return porEvento;
}

function etiquetaOpcion(evento, codigo) {
  if (codigo === 'L') return 'Local · ' + evento.local;
  if (codigo === 'V') return 'Visitante · ' + evento.visitante;
  return 'Empate';
}

/**
 * Botones 1 / X / 2 y panel de confirmación.
 * torneos.js la llama al pintar cada tarjeta de evento.
 */
function opcionesPronostico(evento, usuario, estado, mios) {
  const esParticipante = usuario.rol === 'participante';
  const mio = esParticipante ? mios[evento.id] : null;
  const conf = ui.confirm && ui.confirm.eventoId === evento.id ? ui.confirm : null;
  const reintento = ui.retry && ui.retry.eventoId === evento.id ? ui.retry : null;

  const simbolo = { L: '1', E: 'X', V: '2' };
  const subtitulo = { L: evento.local, E: 'Empate', V: evento.visitante };

  let html = '<div class="opts">';
  for (const o of evento.opciones) {
    const marcado = (mio && mio.opcion === o.codigo) || (conf && conf.opcion === o.codigo) || (reintento && reintento.opcion === o.codigo);
    const bloqueado = !esParticipante || estado !== 'abierto' || mio || reintento;
    html += `<button class="opt${marcado ? ' sel' : ''}" data-action="pick" data-ev="${evento.id}" data-op="${o.codigo}" ${bloqueado ? 'disabled' : ''}>`
         + `<b>${simbolo[o.codigo]}</b><span>${esc(subtitulo[o.codigo])}</span></button>`;
  }
  html += '</div>';

  // El reintento va primero: tras un corte el pronóstico puede existir, pero el usuario aún no lo sabe
  if (reintento) {
    html += `<div class="panel">
      <span class="err">No llegó la confirmación por un corte de conexión.</span>
      <span>Reintentar es seguro: la plataforma reconoce el mismo envío y no cobra dos veces.</span>
      <div class="row"><button class="btn primary" data-action="retry">Reintentar envío</button></div>
    </div>`;
  } else if (mio) {
    html += `<div class="mine">Tu pronóstico: <b>${esc(etiquetaOpcion(evento, mio.opcion))}</b> · operación <span class="mono">${esc(mio.operacion)}</span><br>Registrado, no se puede modificar.</div>`;
  } else if (conf && estado === 'abierto') {
    const s = usuario.saldo;
    const alcanza = s >= evento.costo;
    html += `<div class="panel">
      <span>Confirmar <b>${esc(etiquetaOpcion(evento, conf.opcion))}</b></span>
      <span class="mono">Costo ${evento.costo} · saldo ${s} → ${alcanza ? 'quedará en ' + (s - evento.costo) : 'no alcanza'}</span>
      ${alcanza ? '' : '<span class="err">Saldo insuficiente. El pronóstico no se registrará.</span>'}
      <label class="check row" style="gap:6px"><input type="checkbox" id="sim-${evento.id}" data-action="sim" style="width:auto" ${conf.simular ? 'checked' : ''}> Simular corte de conexión al enviar</label>
      <div class="row"><button class="btn primary" data-action="confirm" ${alcanza ? '' : 'disabled'}>Confirmar pronóstico</button><button class="btn" data-action="cancel">Cancelar</button></div>
    </div>`;
  }
  return html;
}

async function enviarPronostico(req) {
  try {
    const r = await rpc('mp_registrar_pronostico', {
      p_evento_id: Number(req.eventoId),
      p_opcion: req.opcion,
      p_idem_key: req.idemKey
    });
    // Prueba de HU-08: el servidor ya registró, pero la respuesta "se pierde"
    if (req.simularFallo) throw new NetworkError();

    ui.confirm = null;
    ui.retry = null;
    ui.flash = r.repetido
      ? { type: 'ok', msg: `Tu pronóstico ya estaba registrado (operación ${r.operacion}). No se hizo un segundo débito.` }
      : { type: 'ok', msg: `Pronóstico registrado. Operación ${r.operacion}. Se descontaron ${r.costo} créditos.` };
  } catch (e) {
    if (e instanceof NetworkError) {
      ui.confirm = null;
      ui.retry = Object.assign({}, req, { simularFallo: false }); // misma idemKey
      ui.flash = { type: 'bad', msg: 'Se perdió la conexión antes de recibir la confirmación.' };
    } else if (e instanceof AppError && !e.sesion) {
      ui.confirm = null;
      ui.retry = null;
      ui.flash = { type: 'bad', msg: e.message };
    } else {
      throw e;
    }
  }
}

/* Acciones de la tarjeta */
actions.pick = function (d) {
  ui.confirm = { eventoId: Number(d.ev), opcion: d.op, idemKey: nuevaLlave(), simular: false };
};
actions.sim = function () {
  if (ui.confirm) ui.confirm.simular = !ui.confirm.simular;
  return 'norender';
};
actions.cancel = function () {
  ui.confirm = null;
};
actions.confirm = async function () {
  const c = ui.confirm;
  if (!c) return;
  await enviarPronostico({ eventoId: c.eventoId, opcion: c.opcion, idemKey: c.idemKey, simularFallo: c.simular });
};
actions.retry = async function () {
  if (ui.retry) await enviarPronostico(ui.retry);
};
