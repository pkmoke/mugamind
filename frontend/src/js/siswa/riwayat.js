import { materiSiswa } from "../seleksi.js";
import { $, esc, jam } from "../util.js";
import { status } from "../status.js";

export function renderRiwayat() {
  const hasilSiswa = status.db.hasil.filter(
    (h) => h.kelas === status.kelasSiswa,
  );
  const nilai = hasilSiswa.map((h) => h.nilai).filter((n) => n != null).map(Number);
  const rata = nilai.length
    ? Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length)
    : 0;
  const aktivitasSiswa = status.db.aktivitas.filter(
    (a) => a.kelas === status.kelasSiswa,
  );
  $("#kpiSiswa").innerHTML = `
    <div class="card stat" data-tilt="1" data-tilt-kuat="7"><div><div class="small muted">Pertanyaan</div><div class="n"><span data-angka="${status.db.chat.filter((c) => c.kelas === status.kelasSiswa).length}">0</span></div></div></div>
    <div class="card stat" data-tilt="1" data-tilt-kuat="7"><div><div class="small muted">Latihan selesai</div><div class="n"><span data-angka="${hasilSiswa.length}">0</span></div></div></div>
    <div class="card stat" data-tilt="1" data-tilt-kuat="7"><div><div class="small muted">Rata-rata nilai</div><div class="n"><span ${nilai.length ? `data-angka="${rata}"` : ""}>${nilai.length ? rata : hasilSiswa.length ? "Menunggu" : "0"}</span></div></div></div>
    <div class="card stat" data-tilt="1" data-tilt-kuat="7"><div><div class="small muted">Materi kelas ini</div><div class="n"><span data-angka="${materiSiswa().length}">0</span></div></div></div>`;

  $("#tabelRiwayat").innerHTML = aktivitasSiswa.length
    ? `<table class="table"><thead><tr><th>Waktu</th><th>Aktivitas</th><th>Materi / Pertanyaan</th><th>Hasil</th></tr></thead><tbody>
        ${aktivitasSiswa.map((a) => `<tr><td>${jam(a.waktu)}</td><td>${esc(a.tipe)}</td><td>${esc(a.judul)}</td><td>${esc(a.hasil)}</td></tr>`).join("")}
      </tbody></table>
      <p class="small muted" style="margin:0;padding:16px 20px 20px">Riwayat nilai tersimpan 180 hari, cukup untuk laporan semester.</p>`
    : `<div class="kosong">
        <span class="kosong-ikon"><svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.6V12l3 2"/></svg></span>
        <b>Belum ada aktivitas</b>
        <p class="muted small">Semua yang kamu kerjakan tercatat di halaman ini. Mulai dari bertanya ke MugaMind atau mengerjakan latihan soal.</p>
        <div class="btnrow" style="justify-content:center">
          <button class="btn primary" data-act="bukaHalaman" data-page="s-chat">Tanya MugaMind</button>
          <button class="btn ghost" data-act="bukaHalaman" data-page="s-latihan">Kerjakan latihan</button>
        </div>
      </div>`;
}
