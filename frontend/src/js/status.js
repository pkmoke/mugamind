import { api, hapusToken } from "./api.js";
import { KEY } from "./konstanta.js";
const kosong = () => ({
  materi: [],
  soal: [],
  hasil: [],
  aktivitas: [],
  chat: [],
});
export const status = {
  db: kosong(),
  pengguna: null,
  konteksGuru: "semua",
  role: "student",
  kelasSiswa: "",
  filterTingkat: "semua",
  filterRombel: "semua",
};
// Remove legacy demo/cache data; authenticated data lives only in server + memory.
try {
  localStorage.removeItem(KEY);
} catch {}
export function bersihkanSesi() {
  status.db = kosong();
  status.konteksGuru = "semua";
  status.pengguna = null;
  status.role = "student";
  status.kelasSiswa = "";
  status.filterTingkat = "semua";
  status.filterRombel = "semua";
  hapusToken();
  window._draftSoal = [];
}
export function terapkanPengguna(p) {
  status.pengguna = p;
  status.role =
    p.peran === "admin" ? "admin" : p.peran === "guru" ? "teacher" : "student";
  status.kelasSiswa = p.peran === "siswa" ? `${p.tingkat} ${p.rombel}` : "";
}
export async function muatDariServer() {
  if (!status.pengguna) return false;
  if (status.role === "admin" || status.pengguna.wajibGantiSandi) return true;
  const account = status.pengguna.id;
  const [materi, soal, hasil, aktivitas] = await Promise.all([
    api.materi(),
    api.soal(),
    api.hasil(),
    api.aktivitas(),
  ]);
  if (status.pengguna?.id !== account) return false;
  const latihan = hasil.map((h) => ({
    waktu: h.waktu,
    tipe: "Latihan",
    judul: h.judul,
    hasil: h.nilai == null ? "Menunggu penilaian guru" : h.nilai + "/100",
    kelas: h.kelas,
    mapel: h.mapel,
  }));
  status.db = {
    materi,
    soal,
    hasil,
    aktivitas: [...aktivitas, ...latihan].sort((a, b) => b.waktu - a.waktu),
    chat: aktivitas.filter((a) => a.tipe === "Chat"),
  };
  return true;
}
export const bersihkanDataLama = () => 0;
// Presentation-only callers do not write authoritative records.
export const catat = () => {};
export const simpan = () => {};
export function penugasan() {
  return status.pengguna?.penugasan || [];
}
export function bolehKelas(mapel, tingkat, rombel) {
  return penugasan().some(
    (t) => t.mapel === mapel && t.tingkat === tingkat && t.rombel === rombel,
  );
}
export function aturFormGuru(prefix) {
  const mapel = document.querySelector(`#${prefix}Mapel`),
    tingkat = document.querySelector(`#${prefix}Kelas`);
  if (!mapel || !tingkat) return;
  const tugas = penugasan();
  const sebelumnya = mapel.value;
  mapel.replaceChildren(
    ...[...new Set(tugas.map((t) => t.mapel))].map((v) => new Option(v, v)),
  );
  if (tugas.some((t) => t.mapel === sebelumnya)) mapel.value = sebelumnya;
  const sinkron = () => {
    const lama = tingkat.value;
    const daftar = [
      ...new Set(
        tugas.filter((t) => t.mapel === mapel.value).map((t) => t.tingkat),
      ),
    ];
    tingkat.replaceChildren(...daftar.map((v) => new Option(v, v)));
    if (daftar.includes(lama)) tingkat.value = lama;
    for (const input of document.querySelectorAll(`#${prefix}Rombel input`)) {
      input.disabled = !bolehKelas(mapel.value, tingkat.value, input.value);
      input.checked = !input.disabled;
    }
  };
  mapel.onchange = sinkron;
  tingkat.onchange = sinkron;
  sinkron();
}

// A display filter over server-authorized data, never an authorization decision.
export function konteksAktif() {
  try {
    return status.konteksGuru === "semua"
      ? null
      : JSON.parse(status.konteksGuru);
  } catch {
    return null;
  }
}
export function materiAktif() {
  const c = status.role === "teacher" ? konteksAktif() : null;
  return status.db.materi.filter(
    (m) =>
      !c ||
      (m.mapel === c[0] &&
        m.kelas === c[1].split(" ")[0] &&
        (!m.rombel?.length || m.rombel.includes(c[1].split(" ")[1]))),
  );
}
export function dataGuru() {
  const c = konteksAktif(),
    materi = materiAktif(),
    ids = new Set(materi.map((m) => m.id));
  return {
    ...status.db,
    materi,
    soal: status.db.soal.filter(
      (s) => ids.has(s.materiId) && (!c || s.kelas.includes(c[1])),
    ),
    hasil: status.db.hasil.filter(
      (h) =>
        !c || (h.kelas === c[1] && (h.mapel === c[0] || ids.has(h.materiId))),
    ),
    aktivitas: status.db.aktivitas.filter(
      (a) => !c || (a.kelas === c[1] && a.mapel === c[0]),
    ),
  };
}
