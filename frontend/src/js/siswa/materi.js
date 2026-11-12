import {
  definisiDariMateri,
  kelasMapel,
  materiSiswa,
  singkatanMapel,
} from "../seleksi.js";
import { kirimChat, sapaAwal } from "./chat.js";
import { bukaModal, tampilkanHalaman, tutupModal } from "../ui.js";
import { $, esc, elemen } from "../util.js";
import { status } from "../status.js";

const IKON_BUKU =
  '<svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M4 5.5v15"/></svg>';

export function renderChips() {
  const m = materiSiswa()[0];
  const def = m ? definisiDariMateri(m).slice(0, 3) : [];
  $("#chipCepat").replaceChildren(
    ...(def.length
      ? def.map((d) =>
          elemen(
            "button",
            {
              class: "btn ghost",
              "data-act": "chip",
              "data-q": `Apa itu ${d.istilah}?`,
            },
            d.istilah,
          ),
        )
      : [
          elemen(
            "span",
            { class: "small muted" },
            "Belum ada contoh pertanyaan — guru belum mengisi materi untuk kelas ini.",
          ),
        ]),
  );
  sapaAwal();
}

export function renderMateriSiswa() {
  const wadah = $("#daftarMateriSiswa");
  const semua = materiSiswa();
  const filter = $("#filterMapelSiswa"),
    cari = $("#cariMateriSiswa");
  const selected = filter.value;
  filter.replaceChildren(
    elemen("option", { value: "" }, "Semua mata pelajaran"),
    ...[...new Set(semua.map((m) => m.mapel))]
      .sort()
      .map((mapel) => elemen("option", { value: mapel }, mapel)),
  );
  filter.value = selected;
  const query = cari.value.trim().toLocaleLowerCase("id");
  const daftar = semua.filter(
    (m) =>
      (!filter.value || m.mapel === filter.value) &&
      [m.judul, m.mapel, ...m.teks]
        .join(" ")
        .toLocaleLowerCase("id")
        .includes(query),
  );
  $("#jumlahMateriSiswa").textContent =
    `${daftar.length} dari ${semua.length} materi`;
  const lanjut = $("#lanjutBelajar");
  const terakhir = [...status.db.hasil].sort((a, b) => b.waktu - a.waktu)[0];
  const sumber = terakhir && semua.find((m) => m.id === terakhir.materiId);
  lanjut.hidden = !sumber;
  if (sumber)
    lanjut.replaceChildren(
      elemen("h2", {}, "Langkah belajar berikutnya"),
      elemen(
        "p",
        {},
        `Latihan terakhir: ${sumber.judul}. Pelajari kembali bagian yang belum dipahami untuk memperdalam pemahamanmu.`,
      ),
      elemen(
        "button",
        {
          class: "btn primary",
          "data-act": "bacaMateri",
          "data-id": sumber.id,
        },
        "Pelajari kembali",
      ),
    );
  cari.oninput = renderMateriSiswa;
  filter.onchange = renderMateriSiswa;
  const label = $("#labelKelasSiswa");
  if (label) label.textContent = "Kelas " + status.kelasSiswa;
  if (!daftar.length && semua.length) {
    wadah.replaceChildren(
      elemen(
        "div",
        { class: "card kosong" },
        elemen("h2", {}, "Materi tidak ditemukan"),
        elemen("p", {}, "Coba kata lain atau pilih semua mata pelajaran."),
      ),
    );
    return;
  }
  if (!daftar.length) {
    wadah.innerHTML = `
      <div class="card">
        <div class="kosong">
          <span class="kosong-ikon">${IKON_BUKU}</span>
          <b>Materi belum tersedia</b>
          <p class="muted small">Guru belum mengisi materi untuk kelas ${esc(status.kelasSiswa)}. Materi kelas lain memang tidak ditampilkan di sini.</p>
        </div>
      </div>`;
    return;
  }
  wadah.replaceChildren(
    ...daftar.map((m) =>
      elemen(
        "div",
        {
          class: `card materi mapel-${kelasMapel(m.mapel)}`,
          "data-tilt": "1",
          "data-tilt-kuat": "9",
        },
        elemen(
          "div",
          { class: "baris", style: "justify-content:space-between" },
          elemen("span", { class: "mapel-ikon" }, singkatanMapel(m.mapel)),
          elemen(
            "span",
            { class: "baris", style: "gap:6px" },
            m.dibuat && Date.now() - new Date(m.dibuat).getTime() < 7 * 864e5
              ? elemen("span", { class: "tag tag-baru" }, "Baru")
              : "",
            elemen("span", { class: "tag" }, "Kelas " + status.kelasSiswa),
          ),
        ),
        elemen("h3", {}, m.judul),
        elemen(
          "p",
          { class: "muted small", style: "margin:0" },
          `${m.teks.length} bagian materi · ${m.mapel}${
            (m.gambar || []).length ? ` · ${m.gambar.length} gambar` : ""
          }`,
        ),
        elemen(
          "div",
          { class: "btnrow" },
          elemen(
            "button",
            { class: "btn primary", "data-act": "bacaMateri", "data-id": m.id },
            "Buka materi",
          ),
          elemen(
            "button",
            { class: "btn ghost", "data-act": "tanyaMateri", "data-id": m.id },
            "Tanya MugaMind",
          ),
        ),
      ),
    ),
  );
}

export function bacaMateri(id) {
  const m = status.db.materi.find((x) => x.id === id);
  if (!m) return;
  const content = elemen(
    "div",
    { class: "reading-content" },
    m.teks.map((t) => elemen("p", {}, t)),
  );
  if (status.role === "teacher") {
    bukaModal(m.mapel + " · Kelas " + m.kelas, m.judul, [
      content,
      elemen(
        "div",
        { class: "reading-actions" },
        elemen(
          "button",
          { class: "btn primary", "data-act": "editMateri", "data-id": m.id },
          "Edit materi",
        ),
      ),
    ]);
    return;
  }
  $("#metaMateriBaca").textContent = m.mapel + " · Kelas " + status.kelasSiswa;
  $("#judulMateriBaca").textContent = m.judul;
  const isi = m.teks.map((t) => elemen("p", {}, t));
  (m.gambar || []).forEach((g) => {
    const fig = elemen("figure", { class: "gambar-materi" });
    fig.append(
      elemen("img", { src: g.url, alt: g.keterangan || "Gambar materi", loading: "lazy" }),
    );
    if (g.keterangan) fig.append(elemen("figcaption", {}, g.keterangan));
    isi.push(fig);
  });
  $("#isiMateriBaca").replaceChildren(...isi);
  const sudah = (status.db.hasil || []).find((x) => String(x.materiId) === String(m.id));
  const punyaSoal = status.db.soal.some((s) => s.materiId === m.id);
  $("#aksiMateriBaca").replaceChildren(
    elemen(
      "button",
      {
        class: `btn ${sudah ? "ghost" : "primary"}`,
        "data-act": sudah ? "" : "keLatihan",
        "data-id": m.id,
        disabled: !punyaSoal || !!sudah,
      },
      sudah
        ? (sudah.nilai == null ? "Latihan selesai · menunggu penilaian guru" : `Latihan selesai (${sudah.nilai}/100) ✓`)
        : punyaSoal
          ? "Latihan materi ini"
          : "Latihan belum tersedia",
    ),
    elemen(
      "button",
      { class: "btn ghost", "data-act": "tanyaMateri", "data-id": m.id },
      "Tanya MugaMind",
    ),
    elemen(
      "button",
      { class: "btn ghost", "data-act": "rangkumanCepat", "data-id": m.id },
      "Lihat rangkuman",
    ),
  );
  tampilkanHalaman("s-baca");
}

export function tanyaMateri(id) {
  const m = status.db.materi.find((x) => x.id === id);
  if (!m) return;
  tutupModal();
  tampilkanHalaman("s-chat");
  $("#chatInput").value =
    "Apa itu " + m.judul.toLowerCase().split(" ")[0] + "?";
  kirimChat("Jelaskan " + m.judul);
}
