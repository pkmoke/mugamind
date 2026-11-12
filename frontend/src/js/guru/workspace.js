import { $, elemen, keParagraf } from "../util.js";
import { status } from "../status.js";

let focusTrigger = null;
export function bukaEditor(area, mode = "baru", title = "") {
  if (status.role !== "teacher" || !["materi", "soal"].includes(area)) return;
  const page = $("#t-" + area),
    panel = $("#" + area + "Editor");
  if (!panel) return;
  focusTrigger = document.activeElement;
  page.querySelector(":scope > .kepala").hidden = true;
  $("#" + area + "Library").hidden = true;
  panel.hidden = false;
  panel.dataset.dirty = "";
  $("#kelasAktif").disabled = true;
  const suffix = area === "materi" ? "Materi" : "Soal";
  $("#editorTitle" + suffix).textContent = title || "Tambah " + area;
  const staticForm =
    area === "materi" ? $("#formMateri") : panel.querySelector(".tabsoal");
  staticForm.hidden = mode === "edit";
  $("#editHost" + suffix).replaceChildren();
  panel.scrollIntoView({ block: "start" });
  if (mode !== "edit") {
    if (area === "materi") $("#mJudul").focus({ preventScroll: true });
    else {
      $("#tabSoalA").checked = true;
      $("#soalMateri").focus({ preventScroll: true });
    }
  }
}
export function tutupEditor(area, force = false) {
  const panel = $("#" + area + "Editor");
  if (!panel || panel.hidden) return true;
  if (
    !force &&
    panel.dataset.dirty === "1" &&
    !confirm("Perubahan belum disimpan. Kembali ke daftar?")
  )
    return false;
  panel.querySelectorAll("form").forEach((form) => form.reset());
  panel.querySelectorAll(".form-error").forEach((el) => {
    el.hidden = true;
    el.textContent = "";
  });
  $("#materiPreview")?.remove();
  panel.hidden = true;
  panel.dataset.dirty = "";
  $("#t-" + area).querySelector(":scope > .kepala").hidden = false;
  $("#" + area + "Library").hidden = false;
  $("#editHost" + (area === "materi" ? "Materi" : "Soal")).replaceChildren();
  $("#kelasAktif").disabled = false;
  if (focusTrigger?.isConnected && focusTrigger.getClientRects().length)
    focusTrigger.focus({ preventScroll: true });
  else
    $("#t-" + area + " [data-act=bukaEditor]")?.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  return true;
}
export function bolehNavigasi() {
  for (const area of ["materi", "soal"]) if (!tutupEditor(area)) return false;
  return true;
}
export function validasi(formId, errorId, extra = "") {
  const form = $(formId),
    error = $(errorId);
  if (error) {
    error.textContent = "";
    error.hidden = true;
  }
  form
    ?.querySelectorAll("[aria-invalid]")
    .forEach((el) => el.removeAttribute("aria-invalid"));
  const invalid = form?.querySelector(":invalid");
  if (invalid || extra) {
    if (error) {
      error.textContent =
        extra || "Lengkapi kolom yang ditandai sebelum menyimpan.";
      error.hidden = false;
    }
    if (invalid) {
      invalid.setAttribute("aria-invalid", "true");
      if (error) invalid.setAttribute("aria-describedby", error.id);
      invalid.focus();
    } else error?.scrollIntoView({ block: "nearest" });
    return false;
  }
  return true;
}
export function pratinjauMateri() {
  if (!validasi("#formMateri", "#materiError")) return;
  let box = $("#materiPreview");
  if (!box) {
    box = elemen("section", {
      id: "materiPreview",
      class: "editor-preview",
      "aria-label": "Pratinjau materi",
    });
    $("#formMateri .btnrow").before(box);
  }
  const lines = keParagraf($("#mTeks").value);
  box.replaceChildren(
    elemen("p", { class: "eyebrow" }, "Pratinjau"),
    elemen("h2", {}, $("#mJudul").value),
    elemen(
      "p",
      { class: "small muted" },
      `${$("#mMapel").value} · Kelas ${$("#mKelas").value}`,
    ),
    elemen(
      "div",
      { class: "reading-content" },
      lines.map((t) => elemen("p", {}, t)),
    ),
  );
  box.scrollIntoView({ block: "start", behavior: "smooth" });
}
