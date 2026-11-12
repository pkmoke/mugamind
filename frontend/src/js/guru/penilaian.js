import { api } from "../api.js";
import { $, esc, jam } from "../util.js";
import { toast } from "../ui.js";

let memuat = false;

export function renderEsai() {
  const box = $("#daftarEsai");
  if (!box || memuat) return;
  memuat = true;
  box.innerHTML = '<p class="small muted">Memuat esai yang belum dinilai…</p>';
  api
    .esaiMenunggu()
    .then((daftar) => {
      if (!daftar.length) {
        box.innerHTML =
          '<p class="small muted">Tidak ada esai yang menunggu penilaian.</p>';
        return;
      }
      box.innerHTML = daftar.map(kartu).join("");
    })
    .catch((e) => {
      box.innerHTML = `<p class="small muted">${esc(e.message)}</p>`;
    })
    .finally(() => {
      memuat = false;
    });
}

function kartu(x) {
  const esai = x.esai
    .map(
      (q) => `
      <div class="esai-soal" data-soal="${esc(q.soalId)}">
        <p class="esai-tanya">${esc(q.tanya)}</p>
        <p class="esai-label">Jawaban siswa</p>
        <p class="esai-jawab">${q.jawaban ? esc(q.jawaban) : "<i>Tidak dijawab</i>"}</p>
        <details class="esai-kunci">
          <summary>Lihat kunci jawaban</summary>
          <p>${esc(q.kunci || "-")}</p>
        </details>
        <label class="esai-nilai">Nilai (0–100)
          <input type="number" min="0" max="100" step="5" inputmode="numeric" />
        </label>
      </div>`,
    )
    .join("");
  return `
    <article class="esai-kartu" data-id="${esc(x.percobaanId)}">
      <header class="esai-kepala">
        <div>
          <b>${esc(x.namaSiswa)}</b>
          <p class="small muted">${esc(x.kelas)} · ${esc(x.mapel)} · ${esc(x.judul)}</p>
        </div>
        <span class="tag">${x.jumlahEsai} esai · ${jam(x.waktu)}</span>
      </header>
      ${esai}
      <div class="esai-aksi">
        <span class="small muted">Nilai sementara: ${x.nilaiSementara}%</span>
        <button class="btn primary" data-act="simpanNilaiEsai" data-id="${esc(x.percobaanId)}">Simpan nilai</button>
      </div>
    </article>`;
}

export async function simpanNilaiEsai(el) {
  const kartuEl = el.closest(".esai-kartu");
  if (!kartuEl) return;
  const nilai = [];
  let kurang = false;
  kartuEl.querySelectorAll(".esai-soal").forEach((baris) => {
    const input = baris.querySelector("input");
    const angka = Number(input.value);
    if (input.value === "" || Number.isNaN(angka)) {
      kurang = true;
      input.classList.add("salah");
      return;
    }
    nilai.push({ soalId: Number(baris.dataset.soal), poin: Math.round(angka) });
  });
  if (kurang) {
    toast("Isi nilai semua esai dulu ya (0–100).");
    return;
  }
  const hasil = await api.nilaiEsai(kartuEl.dataset.id, nilai);
  toast(`Nilai tersimpan. Nilai akhir: ${hasil.nilai ?? "-"}/100`);
  renderEsai();
}

export async function resetLatihan(el) {
  const id = el.dataset.id;
  if (!id) return;
  await api.resetLatihan(id);
  toast("Latihan dihapus; siswa bisa mengerjakan ulang.");
  renderEsai();
}
