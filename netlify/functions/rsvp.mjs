// Guarda y lista las confirmaciones del cumpleaños 21 de Siuliris.
// Usa Netlify Blobs: el almacenamiento viene incluido en el mismo sitio de Netlify.
//
// Público:  GET  -> { ok }                       (solo dice que la lista está activa)
//           POST -> guarda o actualiza la confirmación de un invitado (una por nombre)
// Admin (encabezado x-pin con el PIN correcto):
//           GET    -> { ok, lista }               (cada fila trae su "clave")
//           PUT    -> { clave, nombre, va, personas, nota }  edita una confirmación
//           DELETE -> { clave }                   borra una confirmación
import { getStore } from "@netlify/blobs";
import { pbkdf2, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// El PIN no se guarda en el código: solo su huella (PBKDF2-SHA256).
const PIN_SAL = "9c817aba598071cf0daa8add495e6683";
const PIN_HUELLA = "956abd99f91f2791b8377593283dba4912bff63d52c58d2f3738fe8ace549174";
const derivar = promisify(pbkdf2);
const pinesBuenos = new Set();

async function esAdmin(req) {
  const pin = String(req.headers.get("x-pin") || "").slice(0, 40);
  if (!pin) return false;
  if (pinesBuenos.has(pin)) return true;
  const h = await derivar(pin, PIN_SAL, 300000, 32, "sha256");
  const ok = timingSafeEqual(h, Buffer.from(PIN_HUELLA, "hex"));
  if (ok) pinesBuenos.add(pin);
  else await new Promise((r) => setTimeout(r, 800)); // frena intentos repetidos
  return ok;
}

const limpio = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const clave = (nombre) =>
  nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "invitado";
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const fila = (d, fecha) => {
  const nombre = limpio(d.nombre, 50);
  const va = d.va === "si" || d.va === true;
  return { nombre, va, personas: va ? Math.max(1, Math.min(10, Number(d.personas) || 1)) : 0, nota: limpio(d.nota, 160), fecha };
};

export default async (req) => {
  const store = getStore({ name: "confirmaciones", consistency: "strong" });
  let d = {};
  if (req.method !== "GET") {
    try { d = await req.json(); } catch { return json({ ok: false, error: "formato" }, 400); }
  }

  // Invitado confirma: una entrada por nombre, así no se duplica.
  if (req.method === "POST") {
    const item = fila(d, new Date().toISOString());
    if (!item.nombre) return json({ ok: false, error: "nombre" }, 400);
    await store.setJSON(clave(item.nombre), item);
    return json({ ok: true });
  }

  if (req.method === "GET") {
    if (!req.headers.get("x-pin")) return json({ ok: true });
    if (!(await esAdmin(req))) return json({ ok: false, error: "pin" }, 401);
    const { blobs } = await store.list();
    const lista = (await Promise.all(blobs.map(async (b) => {
      const v = await store.get(b.key, { type: "json" });
      return v ? { ...v, clave: b.key } : null;
    }))).filter(Boolean);
    return json({ ok: true, lista });
  }

  if (req.method === "PUT" || req.method === "DELETE") {
    if (!(await esAdmin(req))) return json({ ok: false, error: "pin" }, 401);
    const k = limpio(d.clave, 80);
    if (!k) return json({ ok: false, error: "clave" }, 400);
    const actual = await store.get(k, { type: "json" });
    if (!actual) return json({ ok: false, error: "no-existe" }, 404);

    if (req.method === "DELETE") {
      await store.delete(k);
      return json({ ok: true });
    }

    const item = fila(d, actual.fecha);
    if (!item.nombre) return json({ ok: false, error: "nombre" }, 400);
    item.editado = new Date().toISOString();
    const nueva = clave(item.nombre);
    await store.setJSON(nueva, item);
    if (nueva !== k) await store.delete(k);
    return json({ ok: true, clave: nueva });
  }

  return json({ ok: false }, 405);
};

export const config = { path: "/api/rsvp" };
