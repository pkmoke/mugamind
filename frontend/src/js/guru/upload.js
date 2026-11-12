import { validasi } from "./workspace.js";
import { keParagraf } from "../util.js";
import { api } from "../api.js";
import { muatDariServer, aturFormGuru } from "../status.js";
import { kelasTercentang, renderRombel } from "./soal.js";
import { ROMBEL } from "../konstanta.js";
import { kelasMapel, rombelLabel, singkatanMapel } from "../seleksi.js";
import { catat, simpan } from "../status.js";
import { bukaModal, toast, tutupModal } from "../ui.js";
import { $, esc, elemen } from "../util.js";
import { status } from "../status.js";

export function renderUpload() {
  renderRombel("#uRombel", ROMBEL);
  aturFormGuru("u");
  const terakhir = status.db.materi.slice(-3).reverse();
  $("#daftarUpload").innerHTML = terakhir.length
    ? terakhir
        .map(
          (m) => `
      <div class="list-item">
        <div class="baris" style="flex-wrap:nowrap;min-width:0">
          <span class="mapel-ikon mapel-${kelasMapel(m.mapel)}">${esc(singkatanMapel(m.mapel))}</span>
          <div style="min-width:0">
            <b>${esc(m.judul)}</b>
            <div class="small muted">kelas ${esc(m.kelas)} — ${esc(rombelLabel(m))}</div>
          </div>
        </div>
        <span class="tag green">Siap dipakai</span>
      </div>`,
        )
        .join("")
    : '<p class="muted small">Belum ada materi yang diunggah. Materi yang kamu simpan akan muncul di sini.</p>';
}

export async function pilihFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const nama = f.name.toLowerCase();
  const isPdf = nama.endsWith(".pdf") || f.type === "application/pdf";
  const isText =
    nama.endsWith(".txt") ||
    nama.endsWith(".md") ||
    f.type === "text/plain" ||
    f.type === "text/markdown";

  if (isPdf) {
    if (f.size > 10 * 1024 * 1024) {
      toast("Ukuran file PDF maksimal 10 MB");
      input.value = "";
      return;
    }
    toast("Membaca isi berkas PDF...");
    try {
      const hasil = await api.ocrSoal(f);
      const teks = String(hasil.teks || "").trim();
      if (teks.length < 80) {
        throw new Error(
          "Isi PDF hampir tidak terbaca. Pastikan berkas berisi teks, bukan foto buram.",
        );
      }
      $("#uJudul").value = f.name.replace(/\.[^.]+$/, "");
      $("#uTeks").value = teks;
      toast(`PDF terbaca lewat ${hasil.metode || "teks"} — cek lalu simpan materi`);
    } catch (err) {
      bukaModal("Berkas PDF", "Gagal membaca isi PDF", [
        elemen("p", {}, err.message || "Isi PDF tidak bisa dibaca."),
        elemen(
          "p",
          { class: "muted small" },
          "PDF hasil pindaian tetap didukung, tetapi hasilnya bergantung pada ketajaman gambar. Bila tetap gagal, salin teksnya lalu tempel ke formulir.",
        ),
      ]);
    }
  } else if (isText) {
    if (f.size > 1024 * 1024) {
      toast("Ukuran file maksimal 1 MB");
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const teks = String(reader.result)
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);
      $("#uJudul").value = f.name.replace(/\.[^.]+$/, "");
      $("#uTeks").value = teks.join("\n");
      toast("Isi file terbaca — cek lalu simpan sebagai materi");
    };
    reader.readAsText(f);
  } else {
    bukaModal("Berkas materi", "Format belum didukung", [
      elemen("p", {}, "Gunakan berkas PDF, TXT, atau Markdown (maksimal 10 MB)."),
      elemen(
        "p",
        { class: "muted" },
        "Untuk materi DOCX atau format lainnya, salin teksnya lalu tempel langsung ke formulir materi.",
      ),
    ]);
  }
  input.value = "";
}

export async function tempelMateri() {
  if (
    !validasi(
      "#formUpload",
      "#uploadError",
      kelasTercentang("#uRombel").length ? "" : "Pilih sedikitnya satu rombel.",
    )
  )
    return;
  const teks = keParagraf($("#uTeks").value);
  await api.tambahMateri({
    mapel: $("#uMapel").value,
    tingkat: $("#uKelas").value,
    rombel: kelasTercentang("#uRombel"),
    judul: $("#uJudul").value.trim(),
    teks,
    rangkuman: teks.slice(0, 3),
  });
  await muatDariServer();
  $("#uJudul").value = "";
  $("#uTeks").value = "";
  renderUpload();
  toast("Materi tersimpan di server");
}
