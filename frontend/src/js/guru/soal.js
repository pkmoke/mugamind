import { dataGuru, materiAktif, konteksAktif } from "../status.js";
import { tutupEditor, validasi } from "./workspace.js";
import { api } from "../api.js";
import { muatDariServer, penugasan } from "../status.js";
import { ROMBEL, TINGKAT, kodeKelas } from "../konstanta.js";
import { definisiDariMateri, kodeMateri, rombelLabel } from "../seleksi.js";
import { catat, simpan } from "../status.js";
import { bukaModal, toast, tutupModal } from "../ui.js";
import { $, esc, renderOpsi, elemen } from "../util.js";
import { status } from "../status.js";

export function renderDaftarSoal() {
  const db = dataGuru(),
    query = ($("#cariSoal").value || "").trim().toLocaleLowerCase("id-ID");
  const daftar = db.soal.filter((s) => {
    const m = status.db.materi.find((x) => x.id === s.materiId);
    return (s.tanya + " " + (m?.judul || "") + " " + (m?.mapel || ""))
      .toLocaleLowerCase("id-ID")
      .includes(query);
  });
  $("#jumlahSoal").textContent = db.soal.length;
  $("#hasilCariSoal").textContent = `${daftar.length} soal`;
  $("#daftarSoal").innerHTML = daftar.length
    ? daftar
        .map((s, i) => {
          const m = status.db.materi.find((x) => x.id === s.materiId);
          const isEssay = s.tipe === "essay";
          const tipeTag = isEssay
            ? '<span class="tag amber">Essay</span>'
            : '<span class="tag green">Pilihan Ganda</span>';
          const gambarTag = s.gambar
            ? '<span class="tag blue">📷 Gambar</span>'
            : "";
          const kunciTeks = isEssay
            ? `Kunci / Rubrik: ${esc(s.kunciEssay || s.pembahasan || "Uraian")}`
            : `Kunci: ${esc(s.opsi?.[s.jawaban] || "A")}`;
          return `
      <article class="list-item">
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
            <span class="small muted">${esc(m?.mapel || "Materi")} · ${esc(s.kelas.join(", "))}</span>
            ${tipeTag}
            ${gambarTag}
          </div>
          <b>${esc(s.tanya)}</b>
          <p class="small muted">${esc(m?.judul || "Materi dihapus")} · ${kunciTeks}</p>
        </div>
        <div class="btnrow">
          <button class="btn ghost small" data-act="editSoal" data-id="${esc(s.id)}">Edit</button>
          <button class="btn danger small" data-act="hapusSoal" data-id="${esc(s.id)}">Hapus</button>
        </div>
      </article>`;
        })
        .join("")
    : `<div class="kosong"><span class="kosong-ikon" aria-hidden="true">✓</span><b>${query ? "Soal tidak ditemukan" : "Bank soal siap diisi"}</b><p class="muted">${query ? "Gunakan kata kunci pertanyaan atau judul materi." : "Tulis soal sendiri, unggah berkas soal, atau buat pratinjau dari materi. Periksa kunci sebelum diterbitkan."}</p>${query ? "" : '<button class="btn primary" data-act="bukaEditor" data-area="soal">Tambah soal pertama</button>'}</div>`;
}

export function renderKelolaSoal() {
  const label = (m) => `${m.mapel} — ${m.judul} (kelas ${m.kelas})`;
  renderOpsi($("#soalMateri"), materiAktif(), label, "Belum ada materi");
  renderOpsi($("#qMateriManual"), materiAktif(), label, "Belum ada materi");
  renderOpsi($("#uSoalMateri"), materiAktif(), label, "Belum ada materi");
  sinkronKelasManual();
  sinkronKelasUpload();
  renderDaftarSoal();
}

export function sinkronKelasManual() {
  const m = status.db.materi.find((x) => x.id === $("#qMateriManual")?.value);
  if (!m) {
    $("#qKelasManual")?.replaceChildren();
    return;
  }
  renderPilihKelas(
    "#qKelasManual",
    konteksAktif() ? [konteksAktif()[1]] : kodeMateri(m),
  );
}

export function sinkronKelasUpload() {
  const m = status.db.materi.find((x) => x.id === $("#uSoalMateri")?.value);
  if (!m) {
    $("#uKelasUploadSoal")?.replaceChildren();
    return;
  }
  renderPilihKelas(
    "#uKelasUploadSoal",
    konteksAktif() ? [konteksAktif()[1]] : kodeMateri(m),
  );
}

export function kelasTercentang(sel) {
  return Array.from(
    document.querySelectorAll(sel + " input:checked:not(:disabled)"),
  ).map((c) => c.value);
}

export function renderRombel(sel, tercentang) {
  const isi = $(sel);
  if (!isi) return;
  isi.innerHTML = ROMBEL.map(
    (r) =>
      `<label><input type="checkbox" value="${r}" ${tercentang.includes(r) ? "checked" : ""}/> ${r}</label>`,
  ).join("");
}

export function renderPilihKelas(sel, tercentang) {
  const isi = $(sel);
  if (!isi) return;
  const mid =
    sel === "#editKelas"
      ? $("#editMateriId")?.value
      : sel === "#qKelasManual"
        ? $("#qMateriManual")?.value
        : sel === "#uKelasUploadSoal"
          ? $("#uSoalMateri")?.value
          : $("#soalMateri")?.value;
  const m = status.db.materi.find((x) => x.id === mid);
  const allowed = m ? kodeMateri(m) : [];
  isi.classList.add("kelas-pilih");
  isi.innerHTML = allowed
    .map(
      (k) =>
        `<label><input type="checkbox" value="${esc(k)}" ${tercentang.includes(k) ? "checked" : ""}/> ${esc(k)}</label>`,
    )
    .join("");
}

export function gantiTipeSoalManual() {
  const tipe = $("#qTipeSoal")?.value || "pilihan_ganda";
  const blokPG = $("#blokOpsiPG");
  const blokEssay = $("#blokEssay");
  if (blokPG && blokEssay) {
    if (tipe === "essay") {
      blokPG.hidden = true;
      blokEssay.hidden = false;
    } else {
      blokPG.hidden = false;
      blokEssay.hidden = true;
    }
  }
}

export function pilihGambarSoal(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  if (f.size > 5 * 1024 * 1024) {
    toast("Ukuran gambar maksimal 5 MB");
    input.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const rawData = e.target.result;
    const img = new Image();
    img.onload = () => {
      const maxDim = 800;
      let w = img.width,
        h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL("image/jpeg", 0.82);
      window._soalGambarData = compressed;
      const prev = $("#qPreviewGambar");
      const wrap = $("#qPreviewGambarWrap");
      if (prev) prev.src = compressed;
      if (wrap) wrap.hidden = false;
      toast("Gambar soal berhasil dipilih");
    };
    img.src = rawData;
  };
  reader.readAsDataURL(f);
}

export function hapusGambarSoal() {
  window._soalGambarData = null;
  const wrap = $("#qPreviewGambarWrap");
  if (wrap) wrap.hidden = true;
  const img = $("#qPreviewGambar");
  if (img) img.src = "";
  const input = $("#qGambarInput");
  if (input) input.value = "";
}

export async function tambahSoalManual() {
  const materiId = $("#qMateriManual").value;
  const kelas = kelasTercentang("#qKelasManual");
  if (
    !validasi(
      "#formSoal",
      "#soalError",
      kelas.length && materiId
        ? ""
        : "Pilih materi dan sedikitnya satu kelas tujuan.",
    )
  )
    return;

  // Check 50 questions quota
  const sudahAda = status.db.soal.filter(
    (s) => String(s.materiId) === String(materiId),
  ).length;
  if (sudahAda >= 50) {
    toast("Materi ini sudah memiliki batas maksimal 50 soal.");
    return;
  }

  const tipe = $("#qTipeSoal")?.value || "pilihan_ganda";
  const tanya = $("#qPertanyaan").value.trim();
  const pembahasan = $("#qPembahasan").value.trim();
  const gambar = window._soalGambarData || null;

  let opsi = [];
  let jawaban = 0;
  let kunciEssay = "";

  if (tipe === "pilihan_ganda") {
    opsi = ["#qA", "#qB", "#qC", "#qD"].map((s) => $(s).value.trim());
    if (opsi.some((o) => !o)) {
      toast("Lengkapi seluruh opsi pilihan jawaban (A–D).");
      return;
    }
    jawaban = Number($("#qBenar").value) || 0;
  } else {
    opsi = [];
    jawaban = 0;
    kunciEssay = $("#qKunciEssay")?.value.trim() || "";
  }

  await api.tambahSoal({
    materiId,
    tipe,
    topik: "Manual",
    tanya,
    gambar,
    opsi,
    jawaban,
    pembahasan,
    kunciEssay,
    kelas,
  });

  await muatDariServer();
  ["#qPertanyaan", "#qA", "#qB", "#qC", "#qD", "#qPembahasan", "#qKunciEssay"].forEach(
    (s) => {
      const el = $(s);
      if (el) el.value = "";
    },
  );
  hapusGambarSoal();
  tutupEditor("soal", true);
  renderKelolaSoal();
  toast(
    `Soal ${tipe === "essay" ? "essay" : "pilihan ganda"} berhasil ditambahkan.`,
  );
}

export function parseBerkasSoal(text) {
  if (!text || !text.trim()) return [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const regexItem =
    /(?:^|\n)\s*(?:(?:Soal\s*)?(\d+)[\.\):]|\[(?:Soal\s*)?(\d+)\]|#{1,4}\s*(\d+)[\.\)]?)\s+/gi;
  const matches = [];
  let m;
  while ((m = regexItem.exec(normalized)) !== null) {
    matches.push({
      index: m.index,
      matchLength: m[0].length,
      num: m[1] || m[2] || m[3],
    });
  }

  const rawBlocks = [];
  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i].matchLength;
      const end =
        i + 1 < matches.length ? matches[i + 1].index : normalized.length;
      rawBlocks.push(normalized.substring(start, end).trim());
    }
  } else {
    const paras = normalized
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    rawBlocks.push(...paras);
  }

  const hasil = [];

  for (const block of rawBlocks) {
    if (!block.trim()) continue;
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;

    let tipe = "pilihan_ganda";
    if (/\[essay\]|\[uraian\]|^essay:|^uraian:/i.test(block)) {
      tipe = "essay";
    }

    const opsiMap = {};
    const opsiRegex = /^(?:[A-D][\.\)]|\([A-D]\))\s*(.+)$/i;
    let tanyaLines = [];
    let pembahasan = "";
    let kunci = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const kunciMatch = line.match(
        /^(?:Kunci(?:\s*Jawaban)?|Jawaban|Ans)\s*[:=]\s*(.+)$/i,
      );
      if (kunciMatch) {
        kunci = kunciMatch[1].trim();
        continue;
      }
      const pembMatch = line.match(
        /^(?:Pembahasan|Penjelasan|Rubrik)\s*[:=]\s*(.+)$/i,
      );
      if (pembMatch) {
        pembahasan = pembMatch[1].trim();
        continue;
      }
      const optMatch = line.match(opsiRegex);
      if (optMatch) {
        const letter = line.charAt(0).toUpperCase();
        opsiMap[letter] = optMatch[1].trim();
        continue;
      }
      tanyaLines.push(line);
    }

    const hasOptions = Object.keys(opsiMap).length >= 2;
    if (!hasOptions) {
      tipe = "essay";
    }

    const tanya = tanyaLines
      .join("\n")
      .replace(/\[(?:essay|uraian|pg|pilihan ganda)\]/gi, "")
      .trim();
    if (!tanya) continue;

    if (tipe === "pilihan_ganda" && hasOptions) {
      const opsiKeys = ["A", "B", "C", "D"].filter((k) => opsiMap[k]);
      const opsiList = opsiKeys.map((k) => opsiMap[k]);
      let jawIdx = 0;
      if (kunci) {
        const cleanKunci = kunci.toUpperCase().replace(/[^A-D]/g, "");
        if (cleanKunci && opsiKeys.includes(cleanKunci[0])) {
          jawIdx = opsiKeys.indexOf(cleanKunci[0]);
        }
      }
      hasil.push({
        tipe: "pilihan_ganda",
        tanya,
        opsi: opsiList,
        jawaban: jawIdx,
        pembahasan: pembahasan || (kunci ? `Kunci jawaban: ${kunci}` : ""),
        kunciEssay: "",
      });
    } else {
      hasil.push({
        tipe: "essay",
        tanya,
        opsi: [],
        jawaban: 0,
        pembahasan: pembahasan || "",
        kunciEssay: kunci || pembahasan || "",
      });
    }

    if (hasil.length >= 50) break;
  }

  return hasil;
}

export async function pilihFileSoal(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  if (f.size > 10 * 1024 * 1024) {
    toast("Ukuran dokumen soal maksimal 10 MB.");
    input.value = "";
    return;
  }
  const label = $("#labelFileSoal");
  if (label) label.textContent = f.name;

  const nama = f.name.toLowerCase();
  const isPdf = nama.endsWith(".pdf") || f.type === "application/pdf";

  toast("Membaca berkas soal...");
  try {
    let teks = "";
    const isImage = /\.(png|jpe?g|webp)$/i.test(nama);
    const isDocx = nama.endsWith(".docx");
    if (isPdf || isImage || isDocx) {
      toast("Membaca isi berkas...");
      const hasilOCR = await api.ocrSoal(f);
      teks = String(hasilOCR.teks || "");
    } else {
      teks = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsText(f);
      });
    }
    $("#uTeksBerkasSoal").value = teks;
    prosesParseBerkasSoal();
    toast("Berkas berhasil dibaca — memeriksa soal...");
  } catch (err) {
    bukaModal("Berkas Soal", "Gagal membaca berkas", [
      elemen("p", {}, err.message || "Gagal memproses berkas soal."),
    ]);
  }
  input.value = "";
}

export function prosesParseBerkasSoal() {
  const teks = $("#uTeksBerkasSoal")?.value || "";
  if (!teks.trim()) {
    toast("Masukkan atau pilih berkas soal terlebih dahulu.");
    return;
  }
  const hasil = parseBerkasSoal(teks);
  if (!hasil.length) {
    bukaModal(
      "Format Berkas",
      "Tidak ada soal yang terdeteksi",
      "<p>Pastikan format penulisan soal memuat nomor (misal <code>1. Pertanyaan</code>) diikuti opsi <code>A. ...</code> untuk pilihan ganda atau tanpa opsi untuk soal essay.</p>",
    );
    return;
  }

  window._draftUploadSoal = hasil;

  const pgCount = hasil.filter((x) => x.tipe === "pilihan_ganda").length;
  const essayCount = hasil.filter((x) => x.tipe === "essay").length;

  const wrap = $("#uPreviewSoalWrap");
  if (wrap) wrap.hidden = false;

  $("#uJudulPreviewSoal").textContent = `Ditemukan ${hasil.length} soal terdeteksi`;
  $("#uSubPreviewSoal").textContent = `${pgCount} Pilihan Ganda · ${essayCount} Essay (Maksimal 50 soal)`;

  const container = $("#uDaftarPreviewSoal");
  if (container) {
    container.innerHTML = hasil
      .map(
        (s, i) => `
      <div class="draft-item-soal">
        <div class="draft-item-header">
          <span class="small muted">#${i + 1}</span>
          <span class="tag ${s.tipe === "essay" ? "amber" : "green"}">${s.tipe === "essay" ? "Essay" : "Pilihan Ganda"}</span>
        </div>
        <b>${esc(s.tanya)}</b>
        ${
          s.tipe === "pilihan_ganda"
            ? `<p class="small muted">${s.opsi.map((o, j) => `${String.fromCharCode(65 + j)}. ${esc(o)}${j === s.jawaban ? " ✓" : ""}`).join(" | ")}</p>`
            : `<p class="small muted">Kunci / Rubrik: ${esc(s.kunciEssay || s.pembahasan || "Uraian")}</p>`
        }
      </div>`,
      )
      .join("");
  }

  sinkronKelasUpload();
  toast(
    `Berhasil mengekstrak ${hasil.length} soal (${pgCount} PG, ${essayCount} Essay)`,
  );
}

export async function terbitkanSoalUpload() {
  const draft = window._draftUploadSoal || [];
  const materiId = $("#uSoalMateri")?.value;
  const kelas = kelasTercentang("#uKelasUploadSoal");

  if (!materiId) {
    toast("Pilih materi sumber terlebih dahulu.");
    return;
  }
  if (!draft.length) {
    toast("Belum ada soal yang diparse.");
    return;
  }
  if (!kelas.length) {
    toast("Pilih sedikitnya satu kelas tujuan.");
    return;
  }

  const sudahAda = status.db.soal.filter(
    (s) => String(s.materiId) === String(materiId),
  ).length;
  if (sudahAda + draft.length > 50) {
    toast(
      `Total soal melebihi 50 (sudah ada ${sudahAda} soal, mencoba menambah ${draft.length} soal).`,
    );
    return;
  }

  const payload = draft.map((s) => ({
    materiId: Number(materiId),
    tipe: s.tipe,
    topik: "Unggah Berkas",
    tanya: s.tanya,
    gambar: null,
    opsi: s.opsi || [],
    jawaban: s.jawaban || 0,
    pembahasan: s.pembahasan || "",
    kunciEssay: s.kunciEssay || "",
    kelas,
  }));

  await api.terbitkan(payload);
  window._draftUploadSoal = [];
  await muatDariServer();
  $("#uPreviewSoalWrap").hidden = true;
  $("#uTeksBerkasSoal").value = "";
  $("#labelFileSoal").textContent = "Belum ada file dipilih";
  tutupEditor("soal", true);
  renderKelolaSoal();
  toast(`${payload.length} soal berhasil diterbitkan ke kelas tujuan.`);
}

export async function generateSoal() {
  const materiId = $("#soalMateri").value;
  if (
    !validasi(
      "#formGenerate",
      "#generateError",
      materiId ? "" : "Tambahkan materi terlebih dahulu.",
    )
  )
    return;

  const sudahAda = status.db.soal.filter(
    (s) => String(s.materiId) === String(materiId),
  ).length;
  const minta = Number($("#soalJumlah").value) || 5;
  if (sudahAda + minta > 50) {
    toast(
      `Total soal akan melebihi 50 (sudah ada ${sudahAda} soal, batas maksimal 50).`,
    );
    return;
  }

  const tipeGenerate = $("#soalTipeGenerate")?.value || "pilihan_ganda";
  const data = await api.generate(materiId, minta, tipeGenerate);
  window._draftSoal = data.usulan;
  bukaModal(
    "Draft soal",
    "Periksa soal sebelum diterbitkan",
    data.usulan
      .map(
        (s, i) =>
          `<p><b>${i + 1}. ${esc(s.tanya)}</b></p>${
            s.tipe === "essay"
              ? `<p class="small muted">Kunci / acuan jawaban: ${esc(s.kunciEssay || s.pembahasan || "Perlu ditinjau guru")}</p>`
              : `<p>${s.opsi.map((o, j) => esc(o) + (j === s.jawaban ? " ✓" : "")).join(" | ")}</p>`
          }`,
      )
      .join("") +
      '<h3>Kelas tujuan</h3><div id="kelasTerbit" class="kelas-pilih"></div><p id="draftError" class="form-error" role="alert" hidden></p><div class="btnrow"><button class="btn primary" data-act="terbitkanSoal">Terbitkan soal</button><button class="btn ghost" data-act="tutupModal">Periksa kembali</button></div>',
  );
  renderPilihKelas("#kelasTerbit", data.usulan[0]?.kelas || []);
}

export async function terbitkanSoal() {
  const draft = window._draftSoal || [],
    kelas = kelasTercentang("#kelasTerbit");
  if (!draft.length || !kelas.length) {
    toast("Pilih kelas tujuan");
    return;
  }
  await api.terbitkan(
    draft.map((s) => ({
      ...s,
      tipe: s.tipe || "pilihan_ganda",
      gambar: s.gambar || null,
      kunciEssay: s.kunciEssay || "",
      kelas,
    })),
  );
  window._draftSoal = [];
  await muatDariServer();
  tutupModal();
  tutupEditor("soal", true);
  renderKelolaSoal();
  toast("Soal diterbitkan untuk kelas tujuan.");
}

export async function hapusSoal(id) {
  if (!confirm("Hapus soal ini?")) return;
  await api.hapusSoal(id);
  await muatDariServer();
  renderKelolaSoal();
}
