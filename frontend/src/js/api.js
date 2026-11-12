let csrf = "";
let sibuk = 0;
let jamTunda = null;
function mulaiMuat() {
  sibuk += 1;
  if (sibuk === 1)
    jamTunda = setTimeout(() => document.getElementById("barMuat")?.classList.add("aktif"), 140);
}
function selesaiMuat() {
  sibuk = Math.max(0, sibuk - 1);
  if (!sibuk) {
    clearTimeout(jamTunda);
    document.getElementById("barMuat")?.classList.remove("aktif");
  }
}
// Saat halaman dibuka lewat Live Server (port 5500) atau server statis lain,
// /api tidak ada di origin itu. Arahkan ke backend FastAPI supaya login tetap jalan.
const ASAL_SERVER = ["", "80", "443", "8000", "8899"].includes(location.port)
  ? ""
  : `${location.protocol}//${location.hostname}:8000`;
export function hapusToken() {
  csrf = "";
}
export async function panggil(jalur, opsi = {}) {
  const method = opsi.method || "GET";
  const write = !["GET", "HEAD"].includes(method);
  let respons;
  mulaiMuat();
  try {
    respons = await fetch(ASAL_SERVER + "/api" + jalur, {
      ...opsi,
      credentials: ASAL_SERVER ? "include" : "same-origin",
      cache: "no-store",
      headers: {
        ...(write
          ? { "Content-Type": "application/json", "X-CSRF-Token": csrf }
          : {}),
        ...opsi.headers,
      },
      ...(write && !opsi.body ? { body: "{}" } : {}),
    });
  } catch {
    selesaiMuat();
    throw new Error(
      "Server tidak terjangkau. Periksa koneksi lalu coba kembali.",
    );
  }
  selesaiMuat();
  if (!respons.ok) {
    let pesan = "Permintaan gagal";
    try {
      pesan = (await respons.json()).error.pesan;
    } catch {}
    if (respons.status === 401 && jalur !== "/auth/login")
      window.dispatchEvent(new Event("sesi-berakhir"));
    const error = new Error(pesan);
    error.status = respons.status;
    throw error;
  }
  if (respons.status === 204) return null;
  const data = await respons.json();
  if (data.csrfToken) csrf = data.csrfToken;
  return data;
}
async function semua(path) {
  const items = [];
  for (let offset = 0; ; offset += 100) {
    const page = await panggil(`${path}?offset=${offset}&limit=100`);
    items.push(...page);
    if (page.length < 100) return items;
  }
}
const tulis = (path, method, data) =>
  panggil(path, { method, body: JSON.stringify(data) });
export const api = {
  adminAkun: (query) => panggil("/admin/akun?" + new URLSearchParams(query)),
  adminRingkasan: () => panggil("/admin/ringkasan"),
  adminAudit: (offset = 0) => panggil("/admin/audit?offset=" + offset),
  adminBuat: (data) => tulis("/admin/akun", "POST", data),
  adminUbah: (id, data) => tulis(`/admin/akun/${id}`, "PUT", data),
  adminReset: (id, data) =>
    tulis(`/admin/akun/${id}/reset-sandi`, "POST", data),
  adminTugas: (id, data) => tulis(`/admin/akun/${id}/penugasan`, "PUT", data),
  login: (identitas, kataSandi) =>
    tulis("/auth/login", "POST", { identitas, kataSandi }),
  loginUjiCoba: (nama, tingkat, rombel) =>
    tulis("/auth/login-uji-coba", "POST", { nama, tingkat, rombel }),
  saya: () => panggil("/auth/saya"),
  info: () => panggil("/info"),
  logout: () => tulis("/auth/logout", "POST", {}),
  materi: () => semua("/materi"),
  soal: () => semua("/soal"),
  hasil: () => semua("/latihan/riwayat"),
  aktivitas: () => semua("/aktivitas"),
  tambahMateri: (data) => tulis("/materi", "POST", data),
  ubahMateri: (id, data) => tulis(`/materi/${id}`, "PUT", data),
  hapusMateri: (id) => tulis(`/materi/${id}`, "DELETE", {}),
  tambahSoal: (data) => tulis("/soal", "POST", data),
  ubahSoal: (id, data) => tulis(`/soal/${id}`, "PUT", data),
  hapusSoal: (id) => tulis(`/soal/${id}`, "DELETE", {}),
  generate: (materiId, jumlah, tipe = "pilihan_ganda") =>
    tulis("/soal/generate", "POST", { materiId, jumlah, tipe }),
  ocrSoal: async (file) => {
    const response = await fetch(
      ASAL_SERVER + "/api/soal/ekstrak-ocr?filename=" + encodeURIComponent(file.name),
      {
        method: "POST",
        credentials: ASAL_SERVER ? "include" : "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-CSRF-Token": csrf,
        },
        body: file,
      },
    );
    if (!response.ok) {
      let message = "Gagal membaca dokumen dengan OCR";
      try { message = (await response.json()).error.pesan; } catch {}
      throw new Error(message);
    }
    return response.json();
  },
  terbitkan: (usulan) => tulis("/soal/terbitkan", "POST", { usulan }),
  mulai: (materiId) => tulis("/latihan/mulai", "POST", { materiId }),
  kumpul: (percobaanId, jawaban) =>
    tulis("/latihan", "POST", { percobaanId, jawaban }),
  chat: (pertanyaan) => tulis("/chat", "POST", { pertanyaan }),
  rangkuman: (id) => tulis(`/materi/${id}/rangkuman`, "POST", {}),
  sandi: (lama, baru) => tulis("/auth/sandi", "POST", { lama, baru }),
  esaiMenunggu: () => panggil("/latihan/menunggu"),
  nilaiEsai: (id, nilai) => tulis(`/latihan/${id}/nilai`, "POST", { nilai }),
  resetLatihan: (id) => panggil(`/latihan/${id}`, { method: "DELETE" }),
  unggahGambar: (mid, gambar) => tulis(`/materi/${mid}/gambar`, "POST", { gambar }),
  notifikasi: () => panggil("/notifikasi"),
  tandaiNotif: () => panggil("/notifikasi/dibaca", { method: "POST" }),
  hapusGambar: (mid, gid) => panggil(`/materi/${mid}/gambar/${gid}`, { method: "DELETE" }),
};
