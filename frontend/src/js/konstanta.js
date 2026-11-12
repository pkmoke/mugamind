export const KEY = "bemai.v1";
export const SISWA = "Andi";
export const TINGKAT = ["VII", "VIII", "IX"];
export const ROMBEL = ["A", "B", "C", "D", "E", "F"];
export const kodeKelas = (t, r) => t + " " + r;
export const tingkatDari = (kode) => String(kode).split(" ")[0];
export const rombelDari = (kode) => String(kode).split(" ")[1] || "";
export const TTL_HARI = 24 * 60 * 60 * 1000;
export const KONTAK_CS = "0857-1498-5280";
export const KONTAK_WA = "6285714985280";
export const PESAN_WA =
  "Halo customer service MugaMind, saya butuh bantuan menggunakan aplikasi.";
export const tautanWa = () =>
  "https://wa.me/" + KONTAK_WA + "?text=" + encodeURIComponent(PESAN_WA);
