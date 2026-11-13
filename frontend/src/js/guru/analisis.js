import { dataGuru } from "../status.js";
import { ROMBEL, TINGKAT, kodeKelas, tingkatDari } from "../konstanta.js";
import {
  hasilFilter,
  materiKelas,
  materiTingkat,
  rombelLabel,
  soalKelas,
  soalTingkat,
} from "../seleksi.js";
import { bersihkanDataLama, simpan } from "../status.js";
import { aturRoleUI, bukaModal, toast, tutupModal } from "../ui.js";
import { $, esc, jam } from "../util.js";
import { status } from "../status.js";
import { renderEsai } from "./penilaian.js";

export function renderAnalisis() {
  renderEsai();
  const db = dataGuru();
  const dibuang = 0;
  if (dibuang)
    toast(dibuang + " baris data lebih dari 24 jam dihapus otomatis");

  $("#filterKelasAnalisis").innerHTML = ["semua", ...TINGKAT]
    .map(
      (k) =>
        `<button class="chipkelas" data-act="filterTingkat" data-tingkat="${k}" aria-pressed="${status.filterTingkat === k}">${k === "semua" ? "Semua tingkat" : "Kelas " + k}</button>`,
    )
    .join("");
  $("#filterRombelAnalisis").innerHTML =
    status.filterTingkat === "semua"
      ? ""
      : ["semua", ...ROMBEL]
          .map(
            (r) =>
              `<button class="chipkelas" data-act="filterRombel" data-rombel="${r}" aria-pressed="${status.filterRombel === r}">${r === "semua" ? "Semua rombel" : status.filterTingkat + " " + r}</button>`,
          )
          .join("");
  $("#filterRombelAnalisis").style.display =
    status.filterTingkat === "semua" ? "none" : "flex";

  $("#ttlInfo").textContent =
    "Hasil berasal dari penilaian server dan hanya mencakup mata pelajaran serta kelas penugasan Anda. Nilai latihan disimpan 180 hari agar bisa dipakai untuk rapor; log aktivitas dibatasi 90 hari.";

  const barisRingkasan = (judul, cocok, materiN, soalN) => {
    const h = db.hasil.filter(cocok);
    const scored = h.filter((x) => x.nilai != null && Number.isFinite(Number(x.nilai)));
    const r = scored.length
      ? Math.round(scored.reduce((a, b) => a + Number(b.nilai), 0) / scored.length)
      : 0;
    return `<div style="margin-bottom:14px">
      <div class="stat"><span>${judul} <span class="small muted"> ${h.length} latihan · ${scored.length} dinilai · ${materiN} materi · ${soalN} soal</span></span><b>${scored.length ? r + "%" : (h.length ? "Menunggu" : "—")}</b></div>
      <div class="bar"><span style="width:${r}%"></span></div></div>`;
  };
  if (status.filterTingkat === "semua") {
    $("#judulRingkasan").textContent = "Ringkasan per Tingkat";
    $("#ringkasanKelas").innerHTML =
      TINGKAT.map((t) =>
        barisRingkasan(
          "Kelas " + t,
          (x) => tingkatDari(x.kelas) === t,
          db.materi.filter((m) => m.kelas === t).length,
          db.soal.filter((s) => s.kelas.some((k) => tingkatDari(k) === t))
            .length,
        ),
      ).join("") +
      '<p class="small muted">Pilih salah satu tingkat di atas untuk melihat rincian per rombel (A–D).</p>';
  } else {
    $("#judulRingkasan").textContent =
      "Ringkasan Kelas " + status.filterTingkat + " per Rombel";
    $("#ringkasanKelas").innerHTML =
      ROMBEL.map((r) => {
        const kode = kodeKelas(status.filterTingkat, r);
        return barisRingkasan(
          kode,
          (x) => x.kelas === kode,
          db.materi.filter(
            (m) =>
              m.kelas === status.filterTingkat &&
              (!m.rombel.length || m.rombel.includes(r)),
          ).length,
          db.soal.filter((s) => s.kelas.includes(kode)).length,
        );
      }).join("") +
      '<p class="small muted">Kelas tanpa latihan ditandai "—". Angka dihitung dari latihan yang benar-benar dikerjakan siswa kelas tersebut.</p>';
  }

  const hasil = db.hasil.filter(
    (h) =>
      (status.filterTingkat === "semua" ||
        tingkatDari(h.kelas) === status.filterTingkat) &&
      (status.filterRombel === "semua" ||
        h.kelas.split(" ")[1] === status.filterRombel),
  );

  const mapelSelect = $("#rekapMapel");
  const selectedMapel = mapelSelect.value;
  const mapels = [...new Set(hasil.map((h) => h.mapel).filter(Boolean))].sort((a,b) => a.localeCompare(b, "id"));
  mapelSelect.innerHTML = '<option value="">Semua mata pelajaran</option>' +
    mapels.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
  mapelSelect.value = mapels.includes(selectedMapel) ? selectedMapel : "";
  const tanggal = $("#rekapTanggal").value;
  const cariNama = $("#rekapNama").value.trim().toLocaleLowerCase("id-ID");
  const rekap = hasil.filter((h) => {
    const date = new Date(Number(h.waktu || 0));
    const dateKey = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    return (!tanggal || dateKey === tanggal) &&
      (!mapelSelect.value || h.mapel === mapelSelect.value) &&
      (!cariNama || String(h.namaSiswa || "").toLocaleLowerCase("id-ID").includes(cariNama));
  }).sort((a,b) => Number(b.waktu || 0) - Number(a.waktu || 0));
  $("#rekapNilai").innerHTML = rekap.length
    ? rekap.map((h) => `<tr>
        <td>${esc(new Date(Number(h.waktu || 0)).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }))}</td>
        <td>${esc(h.namaSiswa || "Nama tidak tersedia")}</td>
        <td>${esc(h.kelas || "-")}</td>
        <td>${esc(h.mapel || "-")}</td>
        <td>${esc(h.judul || "-")}</td>
        <td class="${h.nilai == null ? "" : Number(h.nilai) >= 75 ? "nilai-baik" : "nilai-perlu"}">${h.nilai == null ? "Menunggu penilaian" : Number(h.nilai).toLocaleString("id-ID") + " / 100"}</td>
      </tr>`).join("")
    : '<tr><td colspan="6" class="muted">Tidak ada hasil yang sesuai filter.</td></tr>';
  $("#rekapJumlah").textContent = `${rekap.length} hasil latihan ditampilkan dari ${hasil.length} hasil pada kelas yang sedang dipilih.`;

  const labelKelas =
    status.filterTingkat === "semua"
      ? "semua kelas"
      : status.filterRombel === "semua"
        ? "kelas " + status.filterTingkat
        : "kelas " + status.filterTingkat + " " + status.filterRombel;
  const nilai = hasil.map((h) => h.nilai).filter((n) => n != null && Number.isFinite(Number(n))).map(Number);
  const bucket = [
    ["90–100", (n) => n >= 90],
    ["80–89", (n) => n >= 80 && n < 90],
    ["70–79", (n) => n >= 70 && n < 80],
    ["<70", (n) => n < 70],
  ];
  $("#distribusiNilai").innerHTML = nilai.length
    ? bucket
        .map(
          ([label, fn]) =>
            `<div class="list-item"><span>${label}</span><b>${nilai.filter(fn).length} latihan</b></div>`,
        )
        .join("") +
      `<p class="small muted" style="margin-top:10px">Rata-rata ${Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length)} dari ${nilai.length} latihan (${labelKelas}).</p>`
    : hasil.length
      ? `<p class="muted">${hasil.length} latihan sudah dikerjakan ${labelKelas}, tetapi belum ada nilai pilihan ganda yang dapat dihitung. Periksa jawaban esai yang menunggu penilaian.</p>`
      : '<p class="muted">Belum ada latihan yang dikerjakan ' +
        labelKelas +
        ".</p>";

  const agg = {};
  hasil.forEach((h) =>
    h.detail.forEach((d) => {
      agg[d.soalId] = agg[d.soalId] || { benar: 0, total: 0 };
      agg[d.soalId].total++;
      if (d.benar) agg[d.soalId].benar++;
    }),
  );
  const urut = Object.entries(agg)
    .map(([id, v]) => {
      const s = db.soal.find((x) => x.id === id);
      return {
        soal: s,
        persen: Math.round((v.benar / v.total) * 100),
        total: v.total,
      };
    })
    .filter((x) => x.soal)
    .sort((a, b) => a.persen - b.persen);

  $("#soalSulit").innerHTML = urut.length
    ? urut
        .slice(0, 5)
        .map(
          (x) => `
        <div class="feature" style="margin-bottom:12px">
          <div class="icon dot ${x.persen < 50 ? "warn" : x.persen < 80 ? "mid" : ""}"></div>
          <div><h3>${esc(x.soal.topik || "Soal")} — ${x.persen}% benar</h3>
            <p class="small muted">${esc(x.soal.tanya)}</p>
            <p class="small muted">Dikerjakan ${x.total} kali</p></div>
        </div>`,
        )
        .join("")
    : '<p class="muted">Belum ada data jawaban.</p>';

  const daftarMateriGuru =
    status.filterTingkat === "semua"
      ? db.materi
      : db.materi.filter(
          (m) =>
            m.kelas === status.filterTingkat &&
            (status.filterRombel === "semua" ||
              (m.rombel || ROMBEL).includes(status.filterRombel)),
        );
  $("#rincianMateri").innerHTML =
    daftarMateriGuru
      .map((m) => {
        const h = db.hasil.filter((x) => x.materiId === m.id);
        if (!h.length)
          return `<div class="list-item"><span>${esc(m.judul)} <span class="tag">kelas ${esc(m.kelas)} — ${esc(rombelLabel(m))}</span></span><span class="tag">belum dikerjakan</span></div>`;
        const scoredMateri = h.filter((x) => x.nilai != null);
        const r = scoredMateri.length
          ? Math.round(scoredMateri.reduce((a, b) => a + Number(b.nilai), 0) / scoredMateri.length)
          : null;
        return `<div class="list-item"><span>${esc(m.judul)} <span class="tag">kelas ${esc(m.kelas)} — ${esc(rombelLabel(m))}</span><div class="small muted">${h.length} latihan · ${scoredMateri.length} dinilai</div></span>
      <span class="tag ${r == null ? "" : r >= 80 ? "green" : "amber"}">${r == null ? "menunggu penilaian" : r >= 80 ? "baik" : "perlu penguatan"}</span></div>`;
      })
      .join("") || '<p class="muted">Belum ada materi untuk kelas ini.</p>';
}

export function hapusAnalisisSekarang() {
  toast("Penghapusan riwayat dikelola pengelola sekolah di server");
}
export function resetData() {
  toast("Data produksi tidak dapat direset melalui browser");
}
export function catatanTeknis() {
  bukaModal(
    "Tentang MugaMind",
    "Belajar dari materi kelasmu",
    "<p>MugaMind membantu siswa membaca materi, bertanya, dan berlatih. Guru menyiapkan bahan ajar dan melihat hasil belajar untuk kelas yang diampunya.</p><p>Jawaban chat saat ini disusun dari pencarian materi sekolah, belum memakai model AI generatif. Periksa sumber jawaban dan tanyakan kepada guru jika penjelasannya belum jelas.</p><p>Untuk masalah akun atau penugasan kelas, hubungi pengelola sekolah. Hasil latihan dan riwayat mengikuti kebijakan penyimpanan sekolah.</p>",
  );
}
