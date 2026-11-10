/* ==========================================================================
   MatchPoint · core.js
   Núcleo compartido. Lo definimos entre los tres al inicio del proyecto
   para que cada módulo use el mismo almacén, las mismas utilidades y
   registre sus pantallas en el mismo lugar.
   ========================================================================== */

const KEY = 'matchpoint.v1';
const TZ = 'America/Bogota';

let db;
const ui = { view: null, flash: null, form: null, confirm: null, retry: null, audUser: null };

// Cada módulo agrega aquí sus pantallas, formularios y acciones
const views = {};
const forms = {};
const actions = {};

class AppError extends Error {
  constructor(msg, fields) { super(msg); this.fields = fields || {}; }
}
class NetworkError extends Error {
  constructor() { super('Corte de conexión simulado'); }
}

const emptyDb = () => ({ users: [], torneos: [], eventos: [], pronosticos: [], movimientos: [], idem: {}, seq: 0, session: null });

function load() {
  try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* sin almacenamiento: seguimos en memoria */ }
}

const uid = p => p + '-' + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function hash(s) {
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mp:' + s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    let h = 7; for (const c of 'mp:' + s) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h;
  }
}

// --- Fechas: todo se muestra en hora de Colombia (UTC−5, sin horario de verano) ---
const fmtFecha = ts => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(ts));
const fmtDia = d => new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d + 'T00:00:00Z'));
const colISO = ts => new Date(ts - 5 * 3600e3).toISOString();
const parseCol = v => v ? new Date(v + ':00-05:00').getTime() : NaN;

// Número de operación consecutivo: PREFIJO-AAAAMMDD-00001
function nextOp(prefix) {
  db.seq += 1;
  return `${prefix}-${colISO(Date.now()).slice(0, 10).replace(/-/g, '')}-${String(db.seq).padStart(5, '0')}`;
}

// --- Ayudas para formularios ---
const tag = hu => `<span class="tag">${hu}</span>`;
const val = (form, name, def = '') => esc(ui.form && ui.form.name === form && ui.form.values[name] != null ? ui.form.values[name] : def);
const ferr = (form, name) => ui.form && ui.form.name === form && ui.form.fields[name] ? `<span class="err">${esc(ui.form.fields[name])}</span>` : '';
const inv = (form, name) => ui.form && ui.form.name === form && ui.form.fields[name] ? ' invalid' : '';

function formError(name, values, err) {
  if (!(err instanceof AppError)) throw err;
  ui.form = { name, values, fields: err.fields };
  ui.flash = { type: 'bad', msg: err.message };
}
