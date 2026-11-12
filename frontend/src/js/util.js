export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (t) =>
  String(t).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const jam = (ms) =>
  new Date(ms).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// Only developer-defined tag/attribute names belong here. Children are always text or DOM nodes.
export function elemen(tag, atribut = {}, ...anak) {
  const el = document.createElement(tag);
  for (const [nama, nilai] of Object.entries(atribut)) {
    if (nilai !== false && nilai != null)
      el.setAttribute(nama, nilai === true ? "" : String(nilai));
  }
  el.append(...anak.flat(Infinity).filter((a) => a != null));
  return el;
}

export function renderOpsi(select, daftar, label, kosong) {
  const opsi = daftar.map((item) =>
    elemen("option", { value: item.id }, label(item)),
  );
  if (!opsi.length && kosong)
    opsi.push(elemen("option", { value: "" }, kosong));
  select.replaceChildren(...opsi);
}

// Ubah teks mentah (PDF/tempel) menjadi paragraf yang layak dibaca.
// Satu kalimat per baris tidak lagi jadi satu paragraf.
export function keParagraf(teks) {
  const blok = String(teks || "")
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const hasil = [];
  for (const b of blok) {
    const baris = b.split("\n").map((s) => s.trim()).filter(Boolean);
    const kalimat = [];
    let buf = "";
    for (const satu of baris) {
      buf = buf ? buf + " " + satu : satu;
      if (/[.!?…:"”’)]$/.test(satu)) {
        kalimat.push(buf);
        buf = "";
      }
    }
    if (buf) kalimat.push(buf);
    let par = "";
    let n = 0;
    for (const k of kalimat) {
      if (par && (n >= 3 || (par + " " + k).length > 420)) {
        hasil.push(par);
        par = "";
        n = 0;
      }
      par = par ? par + " " + k : k;
      n += 1;
    }
    if (par) hasil.push(par);
  }
  return hasil;
}
