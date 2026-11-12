import { ROMBEL, kodeKelas, rombelDari, tingkatDari } from "./konstanta.js";
import { $ } from "./util.js";
import { status } from "./status.js";

export const rombelLabel = (m) => {
  const r = m.rombel && m.rombel.length ? m.rombel : ROMBEL;
  const hilang = ROMBEL.filter((x) => !r.includes(x));
  return hilang.length === 0 ? "semua rombel" : "rombel " + r.join(", ");
};
export const kodeMateri = (m) =>
  (m.rombel && m.rombel.length ? m.rombel : ROMBEL).map((r) =>
    kodeKelas(m.kelas, r),
  );
export const materiKelas = (kode) =>
  status.db.materi.filter(
    (m) =>
      m.kelas === tingkatDari(kode) &&
      (!m.rombel?.length || m.rombel.includes(rombelDari(kode))),
  );
export const soalKelas = (kode) =>
  status.db.soal.filter((s) => (s.kelas || []).includes(kode));
export const materiTingkat = (t) =>
  status.db.materi.filter((m) => m.kelas === t);
export const soalTingkat = (t) =>
  status.db.soal.filter((s) =>
    (s.kelas || []).some((k) => tingkatDari(k) === t),
  );
export const materiSiswa = () => materiKelas(status.kelasSiswa);
export const soalSiswa = () => soalKelas(status.kelasSiswa);
export const kelasMapel = (mapel) =>
  ({ IPA: "ipa", Matematika: "mtk", "Bahasa Indonesia": "bin", IPS: "ips" })[
    mapel
  ] || "ipa";
export const singkatanMapel = (mapel) =>
  (({ Matematika: "MTK", "Bahasa Indonesia": "BIN" })[mapel] || mapel)
    .slice(0, 3)
    .toUpperCase();
export const hasilFilter = () =>
  status.db.hasil.filter((h) => {
    if (
      status.filterTingkat !== "semua" &&
      tingkatDari(h.kelas) !== status.filterTingkat
    )
      return false;
    if (
      status.filterTingkat !== "semua" &&
      status.filterRombel !== "semua" &&
      rombelDari(h.kelas) !== status.filterRombel
    )
      return false;
    return true;
  });

export function definisiDariMateri(m) {
  const pola = /^(.{3,70}?)\s+(adalah|yaitu|merupakan)\s+(.{5,})$/i;
  return m.teks
    .map((t) => {
      const r = t.match(pola);
      return r
        ? { istilah: r[1].trim(), arti: r[3].trim().replace(/\.$/, "") }
        : null;
    })
    .filter(Boolean);
}
