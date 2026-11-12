import { api } from "../api.js";
import {
  muatDariServer,
  aturFormGuru,
  status,
  materiAktif,
  konteksAktif,
} from "../status.js";
import { kelasTercentang, renderRombel } from "./soal.js";
import { ROMBEL } from "../konstanta.js";
import { kelasMapel, rombelLabel, singkatanMapel } from "../seleksi.js";
import { bukaModal, toast } from "../ui.js";
import { keParagraf } from "../util.js";
import { $, elemen, esc } from "../util.js";
import { tutupEditor, validasi } from "./workspace.js";

export function renderDaftarMateri() {
  const query = ($("#cariMateri").value || "")
    .trim()
    .toLocaleLowerCase("id-ID");
  const all = materiAktif();
  const daftar = all.filter((m) =>
    (m.judul + " " + m.mapel + " " + m.kelas)
      .toLocaleLowerCase("id-ID")
      .includes(query),
  );
  $("#jumlahMateri").textContent = all.length;
  $("#hasilCariMateri").textContent = `${daftar.length} materi`;
  $("#daftarMateriGuru").innerHTML = daftar.length
    ? daftar
        .map(
          (m) => `
    <article class="list-item">
      <div class="baris" style="flex-wrap:nowrap;min-width:0">
        <span class="mapel-ikon mapel-${kelasMapel(m.mapel)}">${esc(singkatanMapel(m.mapel))}</span>
        <div style="min-width:0"><b>${esc(m.judul)}</b><p class="small muted">${esc(m.mapel)} · Kelas ${esc(m.kelas)} · ${esc(rombelLabel(m))}<br>${m.teks.length} bagian · ${status.db.soal.filter((s) => s.materiId === m.id).length} soal</p></div>
      </div>
      <div class="btnrow"><button class="btn ghost small" data-act="bacaMateri" data-id="${esc(m.id)}">Baca</button><button class="btn ghost small" data-act="kelolaGambar" data-id="${esc(m.id)}">Gambar${(m.gambar || []).length ? " (" + m.gambar.length + ")" : ""}</button><button class="btn ghost small" data-act="editMateri" data-id="${esc(m.id)}">Edit</button><button class="btn danger small" data-act="hapusMateri" data-id="${esc(m.id)}">Hapus</button></div>
    </article>`,
        )
        .join("")
    : `<div class="kosong"><span class="kosong-ikon" aria-hidden="true">▤</span><b>${query ? "Materi tidak ditemukan" : "Mulai dari satu materi"}</b><p class="muted">${query ? "Coba judul atau kata kunci lain." : "Tambahkan bahan ajar untuk kelasmu. Materi menjadi sumber belajar dan jawaban MugaMind."}</p>${query ? "" : '<button class="btn primary" data-act="bukaEditor" data-area="materi">Tambah materi pertama</button>'}</div>`;
}
export function renderKelolaMateri() {
  renderDaftarMateri();
  renderRombel("#mRombel", ROMBEL);
  aturFormGuru("m");
  const c = konteksAktif();
  if (
    c &&
    $("#mMapel").querySelector("option") &&
    [...$("#mMapel").options].some((o) => o.value === c[0])
  ) {
    $("#mMapel").value = c[0];
    $("#mMapel").dispatchEvent(new Event("change"));
    $("#mKelas").value = c[1].split(" ")[0];
    $("#mKelas").dispatchEvent(new Event("change"));
    document
      .querySelectorAll("#mRombel input")
      .forEach((input) => (input.checked = input.value === c[1].split(" ")[1]));
  }
}
export async function tambahMateri() {
  const rombel = kelasTercentang("#mRombel");
  if (
    !validasi(
      "#formMateri",
      "#materiError",
      rombel.length ? "" : "Pilih sedikitnya satu rombel tujuan.",
    )
  )
    return;
  const judul = $("#mJudul").value.trim(),
    teks = keParagraf($("#mTeks").value);
  if (!judul || !teks.length) {
    validasi(
      "#formMateri",
      "#materiError",
      "Judul dan isi materi tidak boleh kosong.",
    );
    return;
  }
  await api.tambahMateri({
    mapel: $("#mMapel").value,
    tingkat: $("#mKelas").value,
    rombel,
    judul,
    teks,
    rangkuman: teks.slice(0, 3),
  });
  $("#formMateri").reset();
  $("#materiPreview")?.remove();
  tutupEditor("materi", true);
  await muatDariServer();
  renderKelolaMateri();
  toast("Materi tersimpan dan siap dipelajari siswa.");
}
export async function hapusMateri(id) {
  const m = status.db.materi.find((x) => x.id === id);
  if (!m) return;
  if (!confirm('Hapus materi "' + m.judul + '" beserta soal terkait?')) return;
  await api.hapusMateri(id);
  await muatDariServer();
  renderDaftarMateri();
  toast("Materi dihapus.");
}


// ── Gambar pendukung materi ─────────────────────────────────────────
export function kelolaGambar(id) {
  const m = status.db.materi.find((x) => x.id === id);
  if (!m) return;
  const daftar = elemen("div", { class: "galeri-materi" });
  const images = m.gambar || [];
  if (!images.length)
    daftar.append(
      elemen("p", { class: "small muted" }, "Belum ada gambar. Tambahkan diagram atau foto pendukung."),
    );
  images.forEach((g) => {
    const item = elemen("figure", { class: "galeri-item" });
    item.append(elemen("img", { src: g.url, alt: g.keterangan || "Gambar materi", loading: "lazy" }));
    item.append(elemen("figcaption", {}, g.keterangan || "(tanpa keterangan)"));
    item.append(
      elemen(
        "button",
        { class: "btn danger small", "data-act": "hapusGambarMateri", "data-id": m.id, "data-gid": g.id },
        "Hapus",
      ),
    );
    daftar.append(item);
  });

  const pilih = elemen("input", {
    type: "file",
    accept: "image/png,image/jpeg,image/webp",
    class: "filepick",
    "aria-label": "Pilih gambar materi",
  });
  pilih.dataset.peran = "materi";
  pilih.addEventListener("change", (e) => {
    e.stopPropagation();
    unggahGambarMateri(pilih, m);
  });
  const label = elemen("label", { class: "btn primary" }, "Pilih gambar");
  label.append(pilih);

  bukaModal(
    "Gambar materi",
    m.judul,
    [
      elemen("p", { class: "small muted" }, "Gambar otomatis diberi keterangan oleh AI supaya MugaMind bisa menjawab pertanyaan tentang gambar ini. Maksimal 8 gambar, 450 KB per gambar."),
      label,
      daftar,
    ],
  );
}

function kompres(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gambar tidak bisa dibaca"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Format gambar tidak didukung"));
      img.onload = () => {
        const maks = 1000;
        let { width: w, height: h } = img;
        if (w > maks || h > maks) {
          if (w > h) {
            h = Math.round((h * maks) / w);
            w = maks;
          } else {
            w = Math.round((w * maks) / h);
            h = maks;
          }
        }
        const kanvas = document.createElement("canvas");
        kanvas.width = w;
        kanvas.height = h;
        kanvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(kanvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function unggahGambarMateri(input, m) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    toast("Ukuran gambar maksimal 8 MB");
    input.value = "";
    return;
  }
  try {
    toast("Membaca gambar dan menyiapkan keterangan…");
    const dataUrl = await kompres(file);
    await api.unggahGambar(m.id, dataUrl);
    await muatDariServer();
    kelolaGambar(m.id);
    toast("Gambar ditambahkan.");
  } catch (e) {
    toast(e.message);
  } finally {
    input.value = "";
  }
}

export async function hapusGambarMateri(el) {
  const { id, gid } = el.dataset;
  if (!confirm("Hapus gambar ini dari materi?")) return;
  await api.hapusGambar(id, gid);
  await muatDariServer();
  kelolaGambar(id);
  toast("Gambar dihapus.");
}
