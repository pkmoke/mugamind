import { dataGuru } from "../status.js";
import { $, esc, jam } from "../util.js";
import { status } from "../status.js";

export function renderDashboard() {
  const db = dataGuru();
  const nilai = db.hasil.map((h) => h.nilai).filter((n) => n != null && Number.isFinite(Number(n))).map(Number);
  const rata = nilai.length
    ? Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length)
    : 0;
  $("#kpiGuru").innerHTML = `
    <div class="card stat" data-tilt="1" data-tilt-kuat="7"><div><div class="small muted">Materi</div><div class="n"><span data-angka="${db.materi.length}">0</span></div></div></div>
    <div class="card stat" data-tilt="1" data-tilt-kuat="7"><div><div class="small muted">Bank soal</div><div class="n"><span data-angka="${db.soal.length}">0</span></div></div></div>
    <div class="card stat" data-tilt="1" data-tilt-kuat="7"><div><div class="small muted">Latihan dikerjakan</div><div class="n"><span data-angka="${db.hasil.length}">0</span></div></div></div>
    <div class="card stat" data-tilt="1" data-tilt-kuat="7"><div><div class="small muted">Rata-rata nilai</div><div class="n"><span data-angka="${rata}">0</span>${nilai.length ? "%" : ""}</div></div></div>`;

  if (!nilai.length) {
    const value = $("#kpiGuru .card:last-child .n");
    value.textContent = db.hasil.length ? "Menunggu penilaian" : "Belum ada hasil";
    value.style.fontSize = "1.1rem";
  }
  const perMapel = {};
  db.hasil.forEach((h) => {
    const m = db.materi.find((x) => x.id === h.materiId);
    const mapel = m ? m.mapel : "Lainnya";
    if (h.nilai != null) (perMapel[mapel] = perMapel[mapel] || []).push(Number(h.nilai));
  });
  const entri = Object.entries(perMapel);
  $("#performaMapel").innerHTML = entri.length
    ? entri
        .map(([mapel, arr]) => {
          const r = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
          return `<div><div class="stat"><span>${esc(mapel)}</span><b>${r}%</b></div><div class="bar"><span style="width:${r}%"></span></div>
          <p class="small muted" style="margin:6px 0 0">${arr.length} latihan dikerjakan</p></div>`;
        })
        .join("")
    : '<p class="muted">Belum ada data latihan. Minta siswa mengerjakan latihan dulu.</p>';

  $("#aktivitasGuru").innerHTML = db.aktivitas.length
    ? db.aktivitas
        .slice(0, 6)
        .map(
          (a) =>
            `<div class="list-item"><span>${esc(a.tipe)} — ${esc(a.judul)}</span><small class="muted">${a.kelas && a.kelas !== "guru" ? "kelas " + esc(a.kelas) + " · " : ""}${jam(a.waktu)}</small></div>`,
        )
        .join("")
    : '<p class="muted">Belum ada aktivitas siswa.</p>';
}
