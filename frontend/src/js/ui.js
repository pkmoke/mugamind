import { renderAdmin, renderAudit } from "./admin.js";
import { renderAnalisis } from "./guru/analisis.js";
import { renderDashboard } from "./guru/dashboard.js";
import { renderKelolaMateri } from "./guru/materi.js";
import { renderKelolaSoal } from "./guru/soal.js";
import { renderUpload } from "./guru/upload.js";
import { renderPilihLatihan } from "./siswa/latihan.js";
import { renderChips, renderMateriSiswa } from "./siswa/materi.js";
import { renderPilihRangkuman } from "./siswa/rangkuman.js";
import { renderRiwayat } from "./siswa/riwayat.js";
import { jalankanEfek } from "./efek/halaman.js";
import { $, $$, elemen } from "./util.js";
import { status } from "./status.js";

export const JUDUL = {
  "a-akun": "Akun & penugasan",
  "a-audit": "Log perubahan",
  "w-password": "Ganti kata sandi",
  "s-baca": "Baca materi",
  "s-chat": "Tanya MugaMind",
  "s-materi": "Materi pembelajaran",
  "s-latihan": "Latihan soal",
  "s-rangkuman": "Rangkuman materi",
  "s-riwayat": "Riwayat belajar",
  "t-dashboard": "Dashboard guru",
  "t-materi": "Kelola materi",
  "t-soal": "Bank soal",
  "t-upload": "Unggah materi",
  "t-analisis": "Hasil belajar",
};
export function toast(pesan) {
  const t = $("#toast");
  t.textContent = pesan;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 4500);
}
export function tampilkanGalat(error, trigger) {
  const form = trigger?.closest("form");
  const target =
    form?.querySelector(".form-error") ||
    ($("#modal").classList.contains("open") ? $("#draftError") : null) ||
    $("#pageError");
  if (target) {
    target.textContent =
      error.message || String(error) || "Permintaan gagal. Coba lagi.";
    target.hidden = false;
    target.scrollIntoView({ block: "nearest" });
  } else toast(error.message || "Permintaan gagal.");
}
export function tampilkanHalaman(id) {
  if (
    !status.pengguna ||
    !JUDUL[id] ||
    (status.pengguna.wajibGantiSandi && id !== "w-password") ||
    (id === "w-password" && !status.pengguna.wajibGantiSandi) ||
    (id.startsWith("a-") && status.role !== "admin") ||
    (id.startsWith("t-") && status.role !== "teacher") ||
    (id.startsWith("s-") && status.role !== "student")
  )
    return;
  $$(".page").forEach((p) => p.classList.toggle("active", p.id === id));
  $$(
    "#navStudent button, #navTeacher button, #navAdmin button, #mobileNav button",
  ).forEach((b) => {
    const active =
      b.dataset.page === id ||
      (["s-rangkuman", "s-baca"].includes(id) && b.dataset.page === "s-materi");
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("#topTitle").textContent = JUDUL[id];
  document.title = JUDUL[id] + " · MugaMind";
  document.body.classList.toggle("chat-actif", id === "s-chat");
  $("#pageError").hidden = true;
  tutupSidebar();
  segarkanHalaman();
  jalankanEfek(id);
  const heading = $("#" + id + " h1");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0 });
}
export function segarkanHalaman() {
  const aktif = $(".page.active")?.id;
  const renderers = {
    "a-akun": renderAdmin,
    "a-audit": renderAudit,
    "s-materi": renderMateriSiswa,
    "s-latihan": renderPilihLatihan,
    "s-rangkuman": renderPilihRangkuman,
    "s-riwayat": renderRiwayat,
    "t-dashboard": renderDashboard,
    "t-materi": renderKelolaMateri,
    "t-soal": renderKelolaSoal,
    "t-upload": renderUpload,
    "t-analisis": renderAnalisis,
  };
  const result = renderers[aktif]?.();
  result?.catch?.((error) => {
    if (status.pengguna) tampilkanGalat(error);
  });
}
export function aturRoleUI() {
  const guru = status.role === "teacher";
  const admin = status.role === "admin";
  const pending = status.pengguna?.wajibGantiSandi;
  document.body.classList.toggle("mode-admin", admin);
  document.body.classList.toggle("mode-guru", guru);
  document.body.classList.toggle("mode-siswa", !guru && !admin && !pending);
  $("#navStudent").style.display = guru || admin || pending ? "none" : "grid";
  $("#navTeacher").style.display = guru && !pending ? "grid" : "none";
  $("#navAdmin").hidden = !admin || pending;
  $("#mobileNav").hidden = guru || admin || pending;
  $("#roleLabel").textContent = admin
    ? "Administrator sekolah"
    : guru
      ? "Ruang guru"
      : "Ruang belajarmu";
  $("#userName").textContent = status.pengguna?.nama || "";
  $("#userAvatar").textContent = (status.pengguna?.nama || "?").slice(0, 1);
  $("#chipKelas").hidden = guru || admin || pending;
  $("#chipKelas").textContent = "Kelas " + status.kelasSiswa;
  $("#konteksGuru").hidden = !guru;
  const select = $("#kelasAktif");
  select.replaceChildren(
    elemen("option", { value: "semua" }, "Semua kelas"),
  );
  const unique = new Set();
  for (const t of status.pengguna?.penugasan || []) {
    const value = JSON.stringify([t.mapel, t.tingkat + " " + t.rombel]);
    if (!unique.has(value)) {
      select.append(
        elemen("option", { value }, `${t.mapel} · ${t.tingkat} ${t.rombel}`),
      );
      unique.add(value);
    }
  }
  select.value = unique.has(status.konteksGuru) ? status.konteksGuru : "semua";
  $("#labelKelasChat").textContent = "kelas " + status.kelasSiswa;
  $("#labelKelasLatihan").textContent = status.kelasSiswa;
  $("#sapaanNama").textContent = status.pengguna?.nama || "";
  $("#areaLatihan").replaceChildren();
  renderChips();
  sinkronSidebar();
  tampilkanHalaman(
    pending
      ? "w-password"
      : admin
        ? "a-akun"
        : guru
          ? "t-dashboard"
          : "s-materi",
  );
}
let sidebarTrigger = null;
export function sinkronSidebar() {
  const mobile = matchMedia("(max-width:960px)").matches;
  $("#sidebar").setAttribute(
    "aria-hidden",
    mobile && !$("#sidebar").classList.contains("open") ? "true" : "false",
  );
}
export function bukaSidebar() {
  sidebarTrigger = document.activeElement;
  $("#sidebar").classList.add("open");
  $("#overlay").classList.add("open");
  $(".hamburger")?.setAttribute("aria-expanded", "true");
  document.body.classList.add("nav-terbuka");
  $("#sidebar").setAttribute("aria-hidden", "false");
  $(".main").inert = true;
  $("#mobileNav").inert = true;
  $("#sidebar .sidebar-close").focus();
}
export function tutupSidebar() {
  const wasOpen = $("#sidebar").classList.contains("open");
  $("#sidebar").classList.remove("open");
  $("#overlay").classList.remove("open");
  $(".hamburger")?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("nav-terbuka");
  $(".main").inert = false;
  $("#mobileNav").inert = false;
  sinkronSidebar();
  if (wasOpen && sidebarTrigger?.isConnected)
    sidebarTrigger.focus({ preventScroll: true });
}
let modalTrigger = null;
export function bukaModal(tag, judul, isi) {
  const modal = $("#modal");
  if (!modal.classList.contains("open")) modalTrigger = document.activeElement;
  $("#modalTag").textContent = tag;
  $("#modalJudul").textContent = judul;
  if (typeof isi === "string") $("#modalIsi").innerHTML = isi;
  else $("#modalIsi").replaceChildren(...(Array.isArray(isi) ? isi : [isi]));
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  $("#appView").inert = true;
  $("#loginView").inert = true;
  modal.querySelector("button").focus();
  document.body.classList.add("modal-terbuka");
}
export function tutupModal() {
  const wasOpen = $("#modal").classList.contains("open");
  $("#modal").classList.remove("open");
  $("#modal").setAttribute("aria-hidden", "true");
  $("#appView").inert = false;
  $("#loginView").inert = false;
  document.body.classList.remove("modal-terbuka");
  if (
    wasOpen &&
    modalTrigger?.isConnected &&
    modalTrigger.getClientRects().length
  )
    modalTrigger.focus({ preventScroll: true });
}
document.addEventListener("keydown", (e) => {
  const active =
    $("#modal.open") ||
    (matchMedia("(max-width:960px)").matches ? $("#sidebar.open") : null);
  if (!active) return;
  if (e.key === "Escape") {
    e.preventDefault();
    if (active.id === "modal") tutupModal();
    else tutupSidebar();
    return;
  }
  if (e.key !== "Tab") return;
  const focusables = [
    ...active.querySelectorAll(
      'button, a[href], input, select, textarea, [tabindex="0"]',
    ),
  ].filter((el) => !el.disabled && el.getClientRects().length);
  if (!focusables.length) {
    e.preventDefault();
    active.querySelector(".modal-card")?.focus();
    return;
  }
  const first = focusables[0],
    last = focusables.at(-1);
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
window.addEventListener("resize", () => {
  if (!matchMedia("(max-width:960px)").matches) tutupSidebar();
  sinkronSidebar();
});
