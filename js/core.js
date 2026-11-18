/* ==========================================================================
   MatchPoint · core.js
   Núcleo compartido. Lo definimos entre los tres al inicio del proyecto:
   llamadas a Supabase, manejo de errores, fechas y registro de pantallas.
   ========================================================================== */

const TZ = 'America/Bogota';
const TOKEN_KEY = 'matchpoint.token';

const ui = { view: null, flash: null, form: null, confirm: null, retry: null, audUser: null, busy: false };

// Cada módulo agrega aquí sus pantallas, formularios y acciones
const views = {};
const forms = {};
const actions = {};

class AppError extends Error {
  constructor(msg, fields) { super(msg); this.fields = fields || {}; this.sesion = false; }
}
class NetworkError extends Error {
  constructor() { super('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.'); }
}

// --- Token de sesión ---
let tokenMemoria = null;
function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return tokenMemoria; }
}
function setToken(t) {
  tokenMemoria = t;
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* solo memoria */ }
}

// --- Llamada a una función de Supabase (RPC) ---
async function rpc(fn, args = {}, conToken = true) {
  const body = conToken ? { p_token: getToken(), ...args } : args;
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new NetworkError();
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new AppError((data && data.message) || 'El servidor no respondió bien. Intenta de nuevo.');
    if (data && data.hint === 'SESION') err.sesion = true;
    throw err;
  }
  if (data && data.error) throw new AppError(data.error, data.campos);
  return data;
}

const nuevaLlave = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    }));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- Fechas: todo se muestra en hora de Colombia (UTC−5, sin horario de verano) ---
const fmtFecha = ts => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(ts));
const fmtDia = d => new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d + 'T00:00:00Z'));
const colISO = ts => new Date(ts - 5 * 3600e3).toISOString();
const aColombia = v => v ? v + ':00-05:00' : null;   // valor de <input type="datetime-local">

// --- Ayudas para formularios ---
const tag = hu => `<span class="tag">${hu}</span>`;
const val = (form, name, def = '') => esc(ui.form && ui.form.name === form && ui.form.values[name] != null ? ui.form.values[name] : def);
const ferr = (form, name) => ui.form && ui.form.name === form && ui.form.fields[name] ? `<span class="err">${esc(ui.form.fields[name])}</span>` : '';
const inv = (form, name) => ui.form && ui.form.name === form && ui.form.fields[name] ? ' invalid' : '';

function formError(name, values, err) {
  if (!(err instanceof AppError) && !(err instanceof NetworkError)) throw err;
  ui.form = { name, values, fields: err.fields || {} };
  ui.flash = { type: 'bad', msg: err.message };
}
