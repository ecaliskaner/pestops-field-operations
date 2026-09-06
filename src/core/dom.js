// DOM helpers, toast, and HTML escaping. Extracted from app.js (Phase 0a-2).

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];

/* --------------------------------------------------------------- escaping */

// The app builds its UI from template strings assigned to innerHTML. That was
// harmless while every value came from the seed file, but the moment a real
// user types a site name, a technician's note or a customer contact, an
// unescaped interpolation is a stored XSS: the next admin to open that record
// executes the attacker's script with the admin's session.
//
// Two tools below. `esc()` for a single value, and the `html` tagged template
// which escapes EVERY interpolation by default — prefixing an existing template
// literal with `html` is a one-token change that closes the whole class of bug,
// which is why it exists rather than asking each call site to remember `esc`.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape a value for interpolation into HTML text or a quoted attribute.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}

// Marker for a string that is already trusted HTML — typically the result of a
// nested `html` call or a hand-built fragment. Wrapping is deliberate and
// greppable, so an audit can find every place escaping was skipped on purpose.
class RawHtml {
  constructor(value) { this.value = String(value); }
  toString() { return this.value; }
}

/**
 * Mark a string as trusted HTML so `html` interpolates it verbatim.
 * Never call this on anything derived from user input.
 *
 * @param {unknown} value
 * @returns {RawHtml}
 */
export const raw = (value) => new RawHtml(value ?? '');

/**
 * Tagged template that escapes every interpolated value.
 *
 * Arrays are joined with no separator, so `${rows.map(rowHtml)}` works the way
 * the existing code already expects; each element is escaped (or passed through
 * if it is `raw`).
 *
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {RawHtml}
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += interpolate(values[i]) + strings[i + 1];
  }
  return new RawHtml(out);
}

function interpolate(value) {
  if (value instanceof RawHtml) return value.value;
  if (Array.isArray(value)) return value.map(interpolate).join('');
  return esc(value);
}

export function toast(message){const el=$("#toast");el.textContent=message;el.classList.remove("hidden");clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add("hidden"),3000)}
