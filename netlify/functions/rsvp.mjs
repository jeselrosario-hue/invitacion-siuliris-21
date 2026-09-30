// Guarda y lista las confirmaciones del cumpleaños 21 de Siuliris.
// Usa Netlify Blobs: el almacenamiento viene incluido en el mismo sitio de Netlify.
import { getStore } from "@netlify/blobs";

const limpio = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const clave = (nombre) =>
  nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "invitado";
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const store = getStore({ name: "confirmaciones", consistency: "strong" });

  if (req.method === "POST") {
    let d;
    try { d = await req.json(); } catch { return json({ ok: false, error: "formato" }, 400); }
    const nombre = limpio(d.nombre, 50);
    if (!nombre) return json({ ok: false, error: "nombre" }, 400);
    const va = d.va === "si";
    const item = {
      nombre,
      va,
      personas: va ? Math.max(1, Math.min(10, Number(d.personas) || 1)) : 0,
      nota: limpio(d.nota, 160),
      fecha: new Date().toISOString(),
    };
    // Una entrada por nombre: si alguien confirma otra vez, se actualiza su respuesta.
    await store.setJSON(clave(nombre), item);
    return json({ ok: true });
  }

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const lista = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
    return json({ ok: true, lista });
  }

  return json({ ok: false }, 405);
};

export const config = { path: "/api/rsvp" };
