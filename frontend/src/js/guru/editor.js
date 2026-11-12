import { bukaEditor, tutupEditor } from "./workspace.js";
import { api } from "../api.js";
import { muatDariServer, penugasan } from "../status.js";
import { $, elemen, renderOpsi, keParagraf } from "../util.js";
import { status, catat, simpan } from "../status.js";
import { bukaModal, tutupModal, toast } from "../ui.js";
import { ROMBEL, TINGKAT } from "../konstanta.js";
import { renderKelolaMateri } from "./materi.js";
import {
  renderKelolaSoal,
  renderRombel,
  renderPilihKelas,
  kelasTercentang,
} from "./soal.js";

function field(id, label, value, multiline = false) {
  const input = elemen(multiline ? "textarea" : "input", {
    id,
    required: true,
  });
  input.value = value;
  if (multiline) input.rows = 5;
  return elemen("div", {}, elemen("label", { for: id }, label), input);
}
function select(id, label, values, current) {
  const input = elemen("select", { id });
  renderOpsi(
    input,
    values.map((value) => ({ id: value })),
    (item) => item.id,
  );
  input.value = current;
  return elemen("div", {}, elemen("label", { for: id }, label), input);
}
function editor(title, children, save) {
  const area = $(".page.active").id === "t-materi" ? "materi" : "soal";
  const error = elemen("p", {
    class: "form-error",
    role: "alert",
    id: "editError",
  });
  const form = elemen(
    "form",
    { id: "editForm", class: "card editor-form" },
    children,
    error,
    elemen(
      "div",
      { class: "btnrow" },
      elemen(
        "button",
        { class: "btn primary", type: "submit" },
        "Simpan perubahan",
      ),
      elemen(
        "button",
        {
          class: "btn ghost",
          type: "button",
          "data-act": "tutupEditor",
          "data-area": $(".page.active").id === "t-materi" ? "materi" : "soal",
        },
        "Batal",
      ),
    ),
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (status.role !== "teacher") return;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const message = await save();
      if (message) {
        error.textContent = message;
        return;
      }
      await muatDariServer();
      tutupEditor(area, true);
      renderKelolaMateri();
      renderKelolaSoal();
      toast("Perubahan tersimpan di server");
    } catch (e) {
      error.textContent = e.message;
    } finally {
      button.disabled = false;
    }
  });
  bukaEditor(area, "edit", title);
  $("#editHost" + (area === "materi" ? "Materi" : "Soal")).append(form);
  form.querySelector("input, textarea, select")?.focus();
}

export function editMateri(id) {
  if (status.role !== "teacher") return;
  const m = status.db.materi.find((item) => item.id === id);
  if (!m) return;
  editor(
    "Edit materi",
    [
      field("editJudul", "Judul materi", m.judul),
      select(
        "editMapel",
        "Mata pelajaran",
        [...new Set(penugasan().map((t) => t.mapel))],
        m.mapel,
      ),
      select(
        "editTingkat",
        "Tingkat",
        [...new Set(penugasan().map((t) => t.tingkat))],
        m.kelas,
      ),
      elemen("p", { class: "section-label" }, "Kelas tujuan"),
      elemen("div", { id: "editRombel", class: "kelas-pilih" }),
      field(
        "editTeks",
        "Isi materi (satu bagian per baris)",
        m.teks.join("\n"),
        true,
      ),
      field(
        "editRingkasan",
        "Rangkuman (satu poin per baris)",
        (m.rangkuman || []).join("\n"),
        true,
      ),
      elemen(
        "p",
        { class: "small muted" },
        "Periksa rangkuman jika isi materi berubah. Soal terkait tetap tersimpan; kelas tujuan dan kunci soal diubah melalui Edit soal.",
      ),
    ],
    async () => {
      const judul = $("#editJudul").value.trim();
      const teks = keParagraf($("#editTeks").value);
      const rombel = kelasTercentang("#editRombel");
      if (!judul || !teks.length || !rombel.length)
        return "Isi judul, materi, dan minimal satu rombel.";
      await api.ubahMateri(m.id, {
        judul,
        teks,
        rombel,
        mapel: $("#editMapel").value,
        tingkat: $("#editTingkat").value,
        rangkuman: $("#editRingkasan")
          .value.split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
    },
  );
  $("#editRingkasan").required = false;
  renderRombel("#editRombel", m.rombel || ROMBEL);
  const sync = () => {
    for (const i of document.querySelectorAll("#editRombel input")) {
      i.disabled = !penugasan().some(
        (t) =>
          t.mapel === $("#editMapel").value &&
          t.tingkat === $("#editTingkat").value &&
          t.rombel === i.value,
      );
      if (i.disabled) i.checked = false;
    }
  };
  $("#editMapel").onchange = sync;
  $("#editTingkat").onchange = sync;
  sync();
}

export function editSoal(id) {
  if (status.role !== "teacher") return;
  const s = status.db.soal.find((item) => item.id === id);
  if (!s) return;
  const material = elemen("select", { id: "editMateriId", required: true });
  renderOpsi(material, status.db.materi, (m) => `${m.mapel} — ${m.judul}`);
  material.value = s.materiId;

  const isEssay = s.tipe === "essay";

  const formElements = [
    elemen(
      "div",
      {},
      elemen("label", { for: "editMateriId" }, "Materi sumber"),
      material,
    ),
    field("editTanya", "Pertanyaan", s.tanya, true),
  ];

  if (!isEssay) {
    const opsiList = s.opsi && s.opsi.length ? s.opsi : ["", "", "", ""];
    opsiList.forEach((value, i) => {
      formElements.push(
        field("editOpsi" + i, "Pilihan " + String.fromCharCode(65 + i), value),
      );
    });
    formElements.push(
      select(
        "editJawaban",
        "Jawaban benar",
        opsiList.map((_, i) => String.fromCharCode(65 + i)),
        String.fromCharCode(65 + (s.jawaban || 0)),
      ),
    );
  } else {
    formElements.push(
      field(
        "editKunciEssay",
        "Kunci jawaban / pedoman penilaian essay",
        s.kunciEssay || "",
        false,
      ),
    );
  }

  formElements.push(
    field(
      "editPembahasan",
      "Pembahasan (opsional)",
      s.pembahasan || "",
      false,
    ),
    elemen("p", {}, "Kelas tujuan"),
    elemen("div", { id: "editKelas", class: "kelas-pilih" }),
    elemen(
      "p",
      { class: "small muted" },
      "Perubahan berlaku untuk latihan berikutnya. Nilai latihan yang sudah dikumpulkan tetap tersimpan.",
    ),
  );

  editor(
    `Edit soal (${isEssay ? "Essay" : "Pilihan Ganda"})`,
    formElements,
    async () => {
      const tanya = $("#editTanya").value.trim();
      const kelas = kelasTercentang("#editKelas");
      const materiId = material.value;
      if (!tanya || !materiId || !kelas.length)
        return "Lengkapi pertanyaan, materi sumber, dan minimal satu kelas.";

      let opsi = [];
      let jawaban = 0;
      let kunciEssay = "";

      if (!isEssay) {
        opsi = (s.opsi || []).map(
          (_, i) => $("#editOpsi" + i)?.value.trim() || "",
        );
        if (opsi.some((o) => !o))
          return "Lengkapi seluruh opsi pilihan jawaban.";
        const jawLetter = $("#editJawaban")?.value || "A";
        jawaban = jawLetter.charCodeAt(0) - 65;
      } else {
        kunciEssay = $("#editKunciEssay")?.value.trim() || "";
      }

      await api.ubahSoal(s.id, {
        tanya,
        tipe: s.tipe || "pilihan_ganda",
        gambar: s.gambar || null,
        opsi,
        kelas,
        materiId,
        jawaban,
        kunciEssay,
        topik: s.topik || "Manual",
        pembahasan: $("#editPembahasan")?.value.trim() || "",
      });
    },
  );
  if ($("#editPembahasan")) $("#editPembahasan").required = false;
  renderPilihKelas("#editKelas", s.kelas || []);
  material.onchange = () => renderPilihKelas("#editKelas", []);
}
