import { api } from "../api.js";
import { muatDariServer } from "../status.js";
import { SISWA } from "../konstanta.js";
import {
  kelasMapel,
  materiSiswa,
  singkatanMapel,
  soalSiswa,
} from "../seleksi.js";
import { catat, simpan } from "../status.js";
import { jalankanEfek } from "../efek/halaman.js";
import { toast } from "../ui.js";
import { $, $$, esc, renderOpsi, elemen } from "../util.js";
import { status } from "../status.js";

const IKON_KOSONG =
  '<svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11l3 3v13H5z"/><path d="M15 8h4M15 4v4"/><path d="M8.5 13.5l1.8 1.8 3.4-3.6"/></svg>';
const PANAH =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 7l5 5-5 5"/></svg>';

export function renderPilihLatihan() {
  const sel = $("#pilihMateriLatihan");
  const daftarSoal = soalSiswa();
  const pakai = materiSiswa().filter((m) =>
    daftarSoal.some((s) => s.materiId === m.id),
  );
  renderOpsi(
    sel,
    pakai,
    (m) => {
      const h = (status.db.hasil || []).find((x) => String(x.materiId) === String(m.id));
      const suffix = h
        ? (h.nilai == null ? " — Selesai (Menunggu penilaian guru)" : ` — Selesai (Nilai: ${h.nilai}/100)`)
        : ` (${daftarSoal.filter((s) => s.materiId === m.id).length} soal)`;
      return `${m.mapel} — ${m.judul}${suffix}`;
    },
    "Belum ada soal untuk kelas ini",
  );

  const cepat = $("#pilihLatihanCepat");
  if (!cepat) return;
  cepat.innerHTML = pakai.length
    ? pakai
        .map((m) => {
          const n = daftarSoal.filter((s) => s.materiId === m.id).length;
          const h = (status.db.hasil || []).find((x) => String(x.materiId) === String(m.id));
          if (h) {
            return `
            <button class="mapel-${kelasMapel(m.mapel)} sudah-selesai" data-act="keLatihan" data-id="${m.id}" data-selesai="true">
              <span class="pk-atas">
                <span class="mapel-ikon">${esc(singkatanMapel(m.mapel))}</span>
                <span class="tag green">${h.nilai == null ? "Menunggu penilaian guru" : `Sudah dikerjakan · Nilai ${h.nilai}`}</span>
              </span>
              <b>${esc(m.judul)}</b>
              <span class="pk-bawah">
                <span class="small muted">${esc(m.mapel)}</span>
                <span class="pk-aksi selesai">Selesai (1x) ✓</span>
              </span>
            </button>`;
          }
          return `
          <button class="mapel-${kelasMapel(m.mapel)}" data-act="keLatihan" data-id="${m.id}">
            <span class="pk-atas">
              <span class="mapel-ikon">${esc(singkatanMapel(m.mapel))}</span>
              <span class="tag mapel">${n} soal</span>
            </span>
            <b>${esc(m.judul)}</b>
            <span class="pk-bawah">
              <span class="small muted">${esc(m.mapel)}</span>
              <span class="pk-aksi">Mulai latihan ${PANAH}</span>
            </span>
          </button>`;
        })
        .join("")
    : `
      <div class="kosong">
        <span class="kosong-ikon">${IKON_KOSONG}</span>
        <b>Belum ada soal untuk kelas ini</b>
        <p class="muted small">Guru belum menerbitkan soal untuk <b>kelas ${esc(status.kelasSiswa)}</b>. Coba cek lagi nanti, atau tanya MugaMind dulu di halaman Tanya MugaMind.</p>
      </div>`;
}

let sesi = null;
let timer = null;
let memulai = false;
window.addEventListener("beforeunload", (event) => {
  if (sesi && !sesi.selesai) {
    event.preventDefault();
    event.returnValue = "";
  }
});
export function bolehKeluarLatihan() {
  return (
    !sesi ||
    sesi.selesai ||
    confirm(
      "Jawaban latihan belum dikumpulkan. Keluar akan menghapus jawaban sementara. Tetap keluar?",
    )
  );
}
export async function mulaiLatihan(paksaId) {
  if (sesi && !sesi.selesai) {
    toast(
      "Selesaikan atau batalkan latihan yang sedang dikerjakan terlebih dahulu.",
    );
    return;
  }
  const id = paksaId || $("#pilihMateriLatihan").value;
  const materi = status.db.materi.find((x) => x.id === id);
  if (!materi) {
    toast("Pilih materi terlebih dahulu");
    return;
  }
  const sudah = (status.db.hasil || []).find((x) => String(x.materiId) === String(id));
  if (sudah) {
    toast(sudah.nilai == null
      ? `Latihan materi "${materi.judul}" sudah dikumpulkan dan menunggu penilaian guru.`
      : `Latihan materi "${materi.judul}" sudah kamu kerjakan (Nilai: ${sudah.nilai}/100). Latihan hanya dapat dikerjakan 1 kali.`);
    return;
  }
  if (memulai) return;
  memulai = true;
  const account = status.pengguna?.id;
  let attempt;
  try {
    attempt = await api.mulai(id);
  } finally {
    memulai = false;
  }
  if (status.pengguna?.id !== account) return;
  sesi = { ...attempt, materi, selesai: false };
  $("#s-latihan").classList.add("mengerjakan");
  const form = elemen(
    "form",
    { id: "formLatihan" },
    attempt.soal.map((s, i) => {
      const fieldChildren = [];
      if (s.gambar) {
        fieldChildren.push(
          elemen(
            "div",
            { class: "quiz-image-wrap" },
            elemen("img", {
              src: s.gambar,
              alt: `Gambar soal ${i + 1}`,
              class: "quiz-img",
            }),
          ),
        );
      }
      fieldChildren.push(elemen("legend", {}, `${i + 1}. ${s.tanya}`));

      if (s.tipe === "essay") {
        fieldChildren.push(
          elemen(
            "div",
            { class: "quiz-essay-wrap" },
            elemen("textarea", {
              name: "s_" + s.id,
              class: "quiz-essay-input",
              placeholder: "Ketik jawaban uraianmu di sini...",
              rows: 4,
            }),
          ),
        );
      } else {
        (s.opsi || []).forEach((o, j) => {
          fieldChildren.push(
            elemen(
              "label",
              { class: "opsi" },
              elemen("input", { type: "radio", name: "s_" + s.id, value: j }),
              o,
            ),
          );
        });
      }

      return elemen(
        "fieldset",
        {
          "data-soal": s.id,
          "data-tipe": s.tipe || "pilihan_ganda",
          class: "quiz-question",
        },
        ...fieldChildren,
      );
    }),
    elemen(
      "div",
      { class: "btnrow quiz-actions" },
      elemen(
        "button",
        { class: "btn primary", type: "submit" },
        "Kumpulkan jawaban",
      ),
      elemen(
        "button",
        { class: "btn ghost", type: "button", "data-act": "batalLatihan" },
        "Batal",
      ),
    ),
  );
  const progress = elemen(
    "div",
    { class: "quiz-progress" },
    elemen(
      "p",
      { id: "latihanProgressLabel", class: "small" },
      `0 dari ${attempt.soal.length} soal dijawab`,
    ),
    elemen(
      "span",
      { class: "tag", id: "sisaWaktuLatihan" },
      "Menghitung sisa waktu…",
    ),
  );
  const bar = elemen(
    "div",
    {
      class: "bilah-jawab",
      role: "progressbar",
      "aria-label": "Progres menjawab",
      "aria-valuemin": 0,
      "aria-valuemax": attempt.soal.length,
      "aria-valuenow": 0,
    },
    elemen("span", { id: "bilahJawab" }),
  );
  const hitungProgres = () => {
    let count = 0;
    attempt.soal.forEach((s) => {
      if (s.tipe === "essay") {
        const val = form.querySelector(`textarea[name="s_${s.id}"]`)?.value.trim();
        if (val) count++;
      } else {
        if (form.querySelector(`input[name="s_${s.id}"]:checked`)) count++;
      }
    });
    $("#latihanProgressLabel").textContent =
      `${count} dari ${attempt.soal.length} soal dijawab`;
    bar.setAttribute("aria-valuenow", count);
    $("#bilahJawab").style.width =
      Math.round((count / attempt.soal.length) * 100) + "%";
  };
  form.addEventListener("change", hitungProgres);
  form.addEventListener("input", hitungProgres);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    kumpulkanLatihan().catch((e) => toast(e.message));
  });
  $("#areaLatihan").replaceChildren(
    elemen(
      "div",
      { class: "card" },
      elemen("h2", {}, materi.judul),
      elemen(
        "p",
        { class: "muted" },
        "Pilih satu jawaban untuk setiap soal. Soal kosong tidak mendapat nilai. Kumpulkan sebelum waktu berakhir. Jawaban sementara belum tersimpan jika halaman ditutup.",
      ),
      progress,
      bar,
      form,
    ),
  );
  clearInterval(timer);
  const tick = () => {
    const left = Math.max(0, Math.ceil(sesi.expires - Date.now() / 1000));
    const label = $("#sisaWaktuLatihan");
    if (!label) return;
    label.textContent = left
      ? `Sisa waktu ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`
      : "Waktu habis. Mulai latihan kembali.";
    if (!left) {
      clearInterval(timer);
      form
        .querySelectorAll("input, button[type=submit]")
        .forEach((el) => (el.disabled = true));
    }
  };
  tick();
  timer = setInterval(tick, 1000);
}
export async function kumpulkanLatihan() {
  if (!sesi || sesi.selesai || sesi.mengirim) return;
  const current = sesi,
    form = $("#formLatihan");
  if (!form) return;
  const jawaban = current.soal.map((s) => {
    if (s.tipe === "essay") {
      const txt =
        form.querySelector(`textarea[name="s_${s.id}"]`)?.value.trim() || "";
      return {
        soalId: s.id,
        pilihan: -1,
        jawabanTeks: txt,
      };
    }
    return {
      soalId: s.id,
      pilihan: Number(
        form.querySelector(`input[name="s_${s.id}"]:checked`)?.value ?? -1,
      ),
      jawabanTeks: "",
    };
  });
  const adaKosong = current.soal.some((s) => {
    if (s.tipe === "essay") {
      return !form.querySelector(`textarea[name="s_${s.id}"]`)?.value.trim();
    }
    return !form.querySelector(`input[name="s_${s.id}"]:checked`);
  });
  if (adaKosong && !confirm("Masih ada soal kosong. Tetap kumpulkan?"))
    return;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  current.mengirim = true;
  try {
    const hasil = await api.kumpul(current.percobaanId, jawaban);
    if (sesi !== current || !status.pengguna) return;
    current.selesai = true;
    clearInterval(timer);
    $("#sisaWaktuLatihan").textContent = "Latihan selesai";
    form
      .querySelectorAll("input, textarea")
      .forEach((i) => (i.disabled = true));
    button.textContent = "Jawaban sudah dikumpulkan";
    $("#areaLatihan").prepend(
      elemen(
        "div",
        { class: "card" },
        elemen("h2", {}, hasil.nilai == null ? "Jawaban esai menunggu penilaian guru" : `Nilai sementara: ${hasil.nilai}/100`),
        elemen(
          "p",
          {},
          `${hasil.benar} benar dari ${hasil.totalDinilai || 0} soal pilihan ganda. ${hasil.menungguPenilaian || 0} soal esai menunggu penilaian guru.`,
        ),
      ),
    );
    $("#areaLatihan").append(
      elemen(
        "div",
        { class: "card", id: "pembahasanLatihan" },
        elemen("h2", {}, "Pembahasan & Kunci Jawaban"),
        hasil.detail.map((d) => {
          const secItems = [];
          if (d.gambar) {
            secItems.push(
              elemen(
                "div",
                { class: "quiz-image-wrap" },
                elemen("img", {
                  src: d.gambar,
                  alt: "Gambar soal",
                  class: "quiz-img",
                }),
              ),
            );
          }
          secItems.push(elemen("h3", {}, d.tanya));
          if (d.tipe === "essay") {
            secItems.push(
              elemen(
                "p",
                { class: "pembahasan-jawab" },
                d.jawabTeks
                  ? `Jawaban kamu: "${d.jawabTeks}"`
                  : "Jawaban kamu: (Tidak dijawab)",
              ),
              elemen(
                "p",
                { class: "pembahasan-kunci" },
                `Pedoman / Kunci Jawaban: ${d.kunci || d.pembahasan || "-"}`,
              ),
              elemen(
                "p",
                { class: "pembahasan-teks" },
                d.pembahasan ||
                  "Pelajari kembali materi untuk pembahasan lebih lengkap.",
              ),
            );
          } else {
            secItems.push(
              elemen(
                "p",
                {
                  class:
                    "pembahasan-status " +
                    (d.benar ? "ok" : d.jawab < 0 ? "kosong" : "salah"),
                },
                d.benar
                  ? "Benar"
                  : d.jawab < 0
                    ? "Belum dijawab"
                    : "Belum benar",
              ),
              elemen(
                "p",
                { class: "pembahasan-kunci" },
                "Jawaban benar: ",
                elemen("b", {}, d.opsi[d.kunci] || d.kunci),
              ),
              elemen(
                "p",
                { class: "pembahasan-teks" },
                d.pembahasan || "Baca kembali materi untuk penjelasan.",
              ),
            );
          }
          return elemen("section", { class: "pembahasan-item" }, ...secItems);
        }),
      ),
    );
    $("#areaLatihan").append(
      elemen(
        "div",
        { class: "card" },
        elemen("h2", {}, "Langkah selanjutnya"),
        elemen(
          "p",
          {},
          hasil.menungguPenilaian
            ? "Jawaban esai sudah tersimpan dan menunggu penilaian guru. Kamu bisa mempelajari pedoman jawaban sambil menunggu."
            : hasil.benar === hasil.total
              ? "Semua jawaban benar. Coba jelaskan kembali materi ini dengan kata-katamu sendiri."
              : "Periksa pembahasan soal yang belum benar, lalu pelajari kembali materi untuk memperdalam pemahamanmu.",
        ),
        elemen(
          "button",
          {
            class: "btn primary",
            "data-act": "bacaMateri",
            "data-id": current.materi.id,
          },
          "Pelajari kembali materi",
        ),
      ),
    );
    await muatDariServer();
    toast("Hasil latihan tersimpan di server");
  } finally {
    current.mengirim = false;
    button.disabled = current.selesai;
  }
}
export function batalLatihan(force = false) {
  if (!force && !bolehKeluarLatihan()) return;
  clearInterval(timer);
  sesi = null;
  $("#areaLatihan").replaceChildren();
  $("#s-latihan").classList.remove("mengerjakan");
}
