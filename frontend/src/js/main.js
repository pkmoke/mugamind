import { adminActions, resetAdmin } from "./admin.js";
import {
  bukaEditor,
  tutupEditor,
  bolehNavigasi,
  pratinjauMateri,
} from "./guru/workspace.js";
import { renderDaftarMateri } from "./guru/materi.js";
import { renderDaftarSoal, renderKelolaSoal } from "./guru/soal.js";
import { renderKelolaMateri } from "./guru/materi.js";
import { api } from "./api.js";
import { editMateri, editSoal } from "./guru/editor.js";
import {
  catatanTeknis,
  hapusAnalisisSekarang,
  renderAnalisis,
  resetData,
} from "./guru/analisis.js";
import { hapusMateri, tambahMateri, kelolaGambar, hapusGambarMateri } from "./guru/materi.js";
import { renderEsai, simpanNilaiEsai } from "./guru/penilaian.js";
import {
  hapusSoal,
  generateSoal,
  sinkronKelasManual,
  sinkronKelasUpload,
  tambahSoalManual,
  terbitkanSoal,
  gantiTipeSoalManual,
  pilihGambarSoal,
  hapusGambarSoal,
  pilihFileSoal,
  prosesParseBerkasSoal,
  terbitkanSoalUpload,
} from "./guru/soal.js";
import { pilihFile, tempelMateri } from "./guru/upload.js";
import { kodeKelas, tingkatDari, KONTAK_CS, tautanWa } from "./konstanta.js";
import { geserSorot, pasangSemuaTilt, pasangTilt } from "./efek/inti.js";
import { tampilkanView } from "./efek/halaman.js";
import { kirimChat } from "./siswa/chat.js";
import {
  batalLatihan,
  mulaiLatihan,
  bolehKeluarLatihan,
} from "./siswa/latihan.js";
import { bacaMateri, tanyaMateri } from "./siswa/materi.js";
import { buatRangkuman, simpanRangkuman } from "./siswa/rangkuman.js";
import {
  aturRoleUI,
  tampilkanGalat,
  toast,
  bukaModal,
  bukaSidebar,
  segarkanHalaman,
  tampilkanHalaman,
  tutupModal,
  tutupSidebar,
} from "./ui.js";
import { $, $$, elemen } from "./util.js";
import {
  muatDariServer,
  status,
  bersihkanSesi,
  terapkanPengguna,
} from "./status.js";

// Restore the original authenticated shell on logout so hidden pages/forms cannot retain another account's data.
const appTemplate = $("#appView").innerHTML;

function logoWa() {
  const asli = document.querySelector(".menu-ikon-wa svg");
  const kotak = elemen("span", { class: "wa-logo", "aria-hidden": "true" });
  if (asli) kotak.append(asli.cloneNode(true));
  return kotak;
}

function isiMenuProfil() {
  const pengguna = status.pengguna;
  if (!pengguna) return;
  const peran =
    pengguna.peran === "guru"
      ? "Guru"
      : pengguna.peran === "admin"
        ? "Administrator"
        : "Siswa";
  const nama = pengguna.nama || "";
  $("#userAvatarMenu").textContent = (nama || "?").slice(0, 1);
  $("#userNamaMenu").textContent = nama;
  $("#userPeranMenu").textContent =
    pengguna.peran === "siswa" && status.kelasSiswa
      ? peran + " · " + status.kelasSiswa
      : peran;
}

function bukaMenuProfil() {
  const menu = $("#menuProfil"),
    tombol = $("#userAvatar");
  if (!menu || !tombol) return;
  clearTimeout(tutupMenuProfil._t);
  menu.classList.remove("menutup");
  isiMenuProfil();
  menu.hidden = false;
  tombol.setAttribute("aria-expanded", "true");
}

function tutupMenuProfil() {
  const menu = $("#menuProfil"),
    tombol = $("#userAvatar");
  if (!menu || menu.hidden) return;
  const fokusDiMenu = menu.contains(document.activeElement);
  menu.classList.add("menutup");
  clearTimeout(tutupMenuProfil._t);
  tutupMenuProfil._t = setTimeout(() => {
    menu.classList.remove("menutup");
    menu.hidden = true;
  }, 170);
  if (tombol) {
    tombol.setAttribute("aria-expanded", "false");
    if (fokusDiMenu) tombol.focus({ preventScroll: true });
  }
}

function bukaPusatBantuan() {
  const kartu = elemen(
    "div",
    { class: "wa-kartu" },
    logoWa(),
    elemen(
      "div",
      { class: "wa-isi" },
      elemen("b", {}, "Customer service MugaMind"),
      elemen("span", { class: "wa-nomor" }, KONTAK_CS),
      elemen("span", { class: "small muted" }, "Kanal bantuan resmi lewat WhatsApp"),
    ),
  );
  const aksi = elemen(
    "div",
    { class: "btnrow" },
    elemen("button", { class: "btn primary", "data-act": "bukaWa", type: "button" }, "Ya, hubungi customer service"),
    elemen("button", { class: "btn ghost", "data-act": "tutupModal", type: "button" }, "Batal"),
  );
  bukaModal("Bantuan", "Hubungi customer service?", [
    kartu,
    elemen(
      "p",
      {},
      "Kendala login, kata sandi, kelas, atau penggunaan aplikasi bisa ditanyakan lewat WhatsApp berikut. Percakapan akan dibuka di aplikasi WhatsApp.",
    ),
    aksi,
  ]);
}

document.addEventListener("click", (e) => {
  const menu = $("#menuProfil");
  if (!menu || menu.hidden) return;
  if (e.target.closest("#menuProfil") || e.target.closest("#userAvatar")) return;
  tutupMenuProfil();
});

document.addEventListener("keydown", (e) => {
  const menu = $("#menuProfil");
  if (!menu || menu.hidden) return;
  if (e.key === "Escape") {
    tutupMenuProfil();
    return;
  }
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const baris = [...menu.querySelectorAll(".menu-baris")];
  const posisi = baris.indexOf(document.activeElement);
  if (posisi === -1) return;
  e.preventDefault();
  const arah = e.key === "ArrowDown" ? 1 : -1;
  baris[(posisi + arah + baris.length) % baris.length].focus();
});


document.addEventListener("click", (e) => {
  const tombol = e.target.closest && e.target.closest('[data-page="s-materi"]');
  if (!tombol || status.pengguna?.peran !== "siswa") return;
  api
    .tandaiNotif()
    .then(() => AKSI.segarkanNotif())
    .catch(() => {});
});

export const AKSI = {
  ...adminActions,
  bukaEditor(el) {
    const area = el.dataset.area;
    if (area === "materi") renderKelolaMateri();
    else renderKelolaSoal();
    bukaEditor(area);
  },
  tutupEditor(el) {
    tutupEditor(el.dataset.area);
  },
  pratinjauMateri() {
    pratinjauMateri();
  },
  editMateri(el) {
    tutupModal();
    editMateri(el.dataset.id);
  },
  hapusSoal(el) {
    return hapusSoal(el.dataset.id);
  },
  editSoal(el) {
    editSoal(el.dataset.id);
  },
  async segarkanNotif() {
    if (status.pengguna?.peran !== "siswa") return;
    try {
      const data = await api.notifikasi();
      const tombol = document.querySelector('#navStudent [data-page="s-materi"]');
      if (!tombol) return;
      let angka = tombol.querySelector(".notif-angka");
      if (data.baru > 0) {
        if (!angka) {
          angka = document.createElement("span");
          angka.className = "notif-angka";
          angka.setAttribute("aria-label", "materi baru");
          tombol.append(angka);
        }
        angka.textContent = data.baru > 9 ? "9+" : String(data.baru);
        angka.title = data.baru + " materi baru dari guru";
      } else if (angka) {
        angka.remove();
      }
    } catch (e) {
      /* diamkan: notifikasi tidak boleh mengganggu */
    }
  },

  async masuk() {
    const form = $("#formLogin");
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    $("#loginError").hidden = true;
    const button = document.querySelector('[data-act="masuk"]');
    if (button.disabled) return;
    button.disabled = true;
    try {
      const hasil = await api.login(
        $("#loginUser").value.trim(),
        $("#loginPass").value,
      );
      terapkanPengguna(hasil.pengguna);
      if (!(await muatDariServer())) return;
        void AKSI.segarkanNotif();
      $("#loginPass").value = "";
      $("#loginView").style.display = "none";
      $("#appView").style.display = "flex";
      aturRoleUI();
    } finally {
      button.disabled = false;
    }
  },
  async keluar() {
    tutupMenuProfil();
    if (!bolehNavigasi() || !bolehKeluarLatihan()) return;
    await api.logout();
    resetTampilan();
  },
  ubahSandi() {
    tutupMenuProfil();
    const lama = elemen("input", {
      type: "password",
      autocomplete: "current-password",
      required: true,
      maxlength: 256,
    });
    const baru = elemen("input", {
      type: "password",
      autocomplete: "new-password",
      required: true,
      minlength: 12,
      maxlength: 256,
    });
    const pesan = elemen("p", { role: "alert" }),
      button = elemen(
        "button",
        { type: "submit", class: "btn primary" },
        "Simpan dan keluar",
      );
    const form = elemen(
      "form",
      {},
      elemen("label", {}, "Kata sandi lama", lama),
      elemen("label", {}, "Kata sandi baru (minimal 12 karakter)", baru),
      pesan,
      button,
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      button.disabled = true;
      try {
        await api.sandi(lama.value, baru.value);
        resetTampilan();
        toast("Kata sandi diperbarui. Silakan masuk kembali.");
      } catch (e) {
        pesan.textContent = e.message;
      } finally {
        button.disabled = false;
      }
    });
    bukaModal("Keamanan", "Ubah kata sandi", form);
  },
  bukaSidebar() {
    bukaSidebar();
  },
  tutupSidebar() {
    tutupSidebar();
  },
  async bukaHalaman(el) {
    if (!bolehNavigasi()) return;
    $("#mainContent").setAttribute("aria-busy", "true");
    try {
      if (await muatDariServer()) tampilkanHalaman(el.dataset.page);
    } finally {
      $("#mainContent").removeAttribute("aria-busy");
    }
  },
  async masukUjiCoba() {
    const nama = $("#trialNama").value.trim();
    if (nama.length < 2) {
      toast("Masukkan nama siswa minimal 2 karakter.");
      $("#trialNama").focus();
      return;
    }
    const hasil = await api.loginUjiCoba(nama, $("#trialTingkat").value, $("#trialRombel").value);
    terapkanPengguna(hasil.pengguna);
    if (!(await muatDariServer())) return;
    $("#loginView").style.display = "none";
    $("#appView").style.display = "flex";
    aturRoleUI();
    toast("Berhasil masuk sebagai siswa uji coba.");
  },
  toggleTheme() {
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    document.body.dataset.theme = next;
    try { localStorage.setItem("bemai-theme", next); } catch {}
    updateThemeButton();
  },
  bukaProfil() {
    const menu = $("#menuProfil");
    if (!menu) return;
    if (menu.hidden || menu.classList.contains("menutup")) bukaMenuProfil();
    else tutupMenuProfil();
  },
  tutupProfil() {
    tutupMenuProfil();
  },
  bukaBantuan() {
    tutupMenuProfil();
    bukaPusatBantuan();
  },
  bukaWa() {
    tutupModal();
    const tautan = document.createElement("a");
    tautan.href = tautanWa();
    tautan.target = "_blank";
    tautan.rel = "noopener noreferrer";
    document.body.append(tautan);
    tautan.click();
    tautan.remove();
  },
  catatanTeknis() {
    catatanTeknis();
  },
  tutupModal() {
    tutupModal();
  },
  kirimChat() {
    return kirimChat();
  },
  ulangChat(el) {
    return kirimChat(el.dataset.q);
  },
  chip(el) {
    return kirimChat(el.dataset.q);
  },
  bacaMateri(el) {
    bacaMateri(el.dataset.id);
  },
  tanyaMateri(el) {
    tanyaMateri(el.dataset.id);
  },
  keLatihan(el) {
    tutupModal();
    tampilkanHalaman("s-latihan");
    return mulaiLatihan(el.dataset.id);
  },
  mulaiLatihan() {
    return mulaiLatihan();
  },
  batalLatihan() {
    batalLatihan();
  },
  buatRangkuman() {
    return buatRangkuman();
  },
  rangkumanCepat(el) {
    tampilkanHalaman("s-rangkuman");
    $("#pilihMateriRangkuman").value = el.dataset.id;
    return buatRangkuman();
  },
  simpanRangkuman(el) {
    return simpanRangkuman(el.dataset.id);
  },
  tambahMateri() {
    return tambahMateri();
  },
  hapusMateri(el) {
    return hapusMateri(el.dataset.id);
  },
  bersihkanMateri() {
    $("#mJudul").value = "";
    $("#mTeks").value = "";
  },
  generateSoal() {
    return generateSoal();
  },
  async kelolaGambar(el) {
   return kelolaGambar(el.dataset.id);
 },
 hapusGambarMateri(el) {
   return hapusGambarMateri(el);
 },
 async simpanNilaiEsai(el) {
   await simpanNilaiEsai(el);
    await muatDariServer();
    renderAnalisis();
  },
  muatEsai() {
    renderEsai();
  },
  terbitkanSoal() {
    return terbitkanSoal();
  },
  tambahSoalManual() {
    return tambahSoalManual();
  },
  gantiTipeSoalManual() {
    gantiTipeSoalManual();
  },
  hapusGambarSoal() {
    hapusGambarSoal();
  },
  prosesParseBerkasSoal() {
    prosesParseBerkasSoal();
  },
  terbitkanSoalUpload() {
    return terbitkanSoalUpload();
  },
  pilihFile(el) {
    pilihFile(el);
  },
  tempelMateri() {
    return tempelMateri();
  },
  resetData() {
    resetData();
  },
  filterTingkat(el) {
    status.filterTingkat = el.dataset.tingkat;
    status.filterRombel = "semua";
    renderAnalisis();
  },
  filterRombel(el) {
    status.filterRombel = el.dataset.rombel;
    renderAnalisis();
  },
  pilihSemuaKelas(el) {
    const target = el.dataset.target;
    const t = el.dataset.tingkat;
    $$(`${target} input`).forEach((c) => {
      if (tingkatDari(c.value) === t) c.checked = true;
    });
  },
  hapusAnalisis() {
    hapusAnalisisSekarang();
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const fn = AKSI[el.dataset.act];
  if (!fn) return;
  if (el.tagName === "INPUT" && el.type === "file") return;
  e.preventDefault();
  if (el.dataset.pending) return;
  el.dataset.pending = "1";
  el.setAttribute("aria-busy", "true");
  const writing = [
    "tambahMateri",
    "tambahSoalManual",
    "generateSoal",
    "terbitkanSoal",
    "tempelMateri",
  ].includes(el.dataset.act);
  const label = el.textContent;
  if (writing) {
    el.disabled = true;
    el.textContent =
      el.dataset.act === "generateSoal" ? "Menyiapkan soal…" : "Menyimpan…";
  }
  Promise.resolve()
    .then(() => fn(el))
    .catch((error) => tampilkanGalat(error, el))
    .finally(() => {
      delete el.dataset.pending;
      el.removeAttribute("aria-busy");
      if (writing && el.isConnected) {
        el.disabled = false;
        el.textContent = label;
      }
    });
});

function updateThemeButton() {
  const button = $("#themeToggle");
  if (!button) return;
  const gelap = document.body.dataset.theme === "dark";
  button.setAttribute("aria-pressed", gelap ? "true" : "false");
  button.setAttribute("aria-label", gelap ? "Mode terang" : "Mode gelap");
}
function initTheme() {
  let theme = "light";
  try { theme = localStorage.getItem("bemai-theme") || "light"; } catch {}
  document.body.dataset.theme = theme === "dark" ? "dark" : "light";
  updateThemeButton();
}
initTheme();
api.info().then((info) => {
  const trial = $(".trial-login");
  if (trial) trial.hidden = !info.studentTrialEnabled;
}).catch(() => {});

function bindFormEvents() {
  $("#cariMateri").addEventListener("input", renderDaftarMateri);
  $("#cariSoal").addEventListener("input", renderDaftarSoal);
  $("#rekapTanggal")?.addEventListener("change", renderAnalisis);
  $("#rekapMapel")?.addEventListener("change", renderAnalisis);
  $("#rekapNama")?.addEventListener("input", renderAnalisis);
  $("#kelasAktif").addEventListener("change", () => {
    status.konteksGuru = $("#kelasAktif").value;
    segarkanHalaman();
  });
  for (const form of document.querySelectorAll("[data-create-form]"))
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      form
        .querySelector(
          '[data-act="tambahMateri"], [data-act="tambahSoalManual"], [data-act="generateSoal"]',
        )
        ?.click();
    });
  $("#formUpload").addEventListener("submit", (e) => {
    e.preventDefault();
    $("#formUpload [data-act=tempelMateri]").click();
  });
  $("#chatInput").addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  });
  $("#fileMateri").addEventListener("change", (e) => pilihFile(e.target));
  $("#qMateriManual").addEventListener("change", sinkronKelasManual);
  const fileBerkasSoal = $("#fileBerkasSoal");
  if (fileBerkasSoal) {
    fileBerkasSoal.addEventListener("change", (e) => pilihFileSoal(e.target));
  }
  const qGambarInput = $("#qGambarInput");
  if (qGambarInput) {
    qGambarInput.addEventListener("change", (e) => pilihGambarSoal(e.target));
  }
  const uSoalMateri = $("#uSoalMateri");
  if (uSoalMateri) {
    uSoalMateri.addEventListener("change", sinkronKelasUpload);
  }
  const qTipeSoal = $("#qTipeSoal");
  if (qTipeSoal) {
    qTipeSoal.addEventListener("change", gantiTipeSoalManual);
  }
  $("#chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (!e.shiftKey && !e.isComposing) {
        e.preventDefault();
        kirimChat().catch((error) => tampilkanGalat(error));
      }
    }
  });
}
bindFormEvents();
$("#formLogin").addEventListener("submit", (e) => {
  e.preventDefault();
  $("#formLogin [data-act=masuk]").click();
});
document.addEventListener("input", (e) => {
  const panel = e.target.closest(".editor-workspace");
  if (panel) panel.dataset.dirty = "1";
});
document.addEventListener("change", (e) => {
  const panel = e.target.closest(".editor-workspace");
  if (panel) panel.dataset.dirty = "1";
});

$("#modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") tutupModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    tutupModal();
    tutupSidebar();
  }
});

function resetTampilan() {
  resetAdmin();
  bersihkanSesi();
  batalLatihan(true);
  tutupModal();
  tutupSidebar();
  $("#appView").style.display = "none";
  $("#loginView").style.display = "grid";
  $("#appView").innerHTML = appTemplate;
  updateThemeButton();
  $("#modalIsi").replaceChildren();
  for (const selector of ["#modalJudul", "#modalTag", "#toast"])
    $(selector).textContent = "";
  document.body.classList.remove(
    "mode-admin",
    "mode-guru",
    "mode-siswa",
    "chat-actif",
    "modal-terbuka",
  );
  bindFormEvents();
  pasangSemuaTilt();
  $("#loginPass").value = "";
}
window.addEventListener("sesi-berakhir", resetTampilan);
$("#appView").style.display = "none";
$("#loginView").style.display = "grid";
pasangSemuaTilt();
pasangTilt($(".login-card"), 7);
geserSorot();
window.addEventListener("resize", geserSorot);
api
  .saya()
  .then(async (data) => {
    terapkanPengguna(data.pengguna);
    await muatDariServer();
    $("#loginView").style.display = "none";
    $("#appView").style.display = "flex";
    aturRoleUI();
  })
  .catch((error) => {
    resetTampilan();
    if (error.status !== 401)
      tampilkanGalat(error, $("#formLogin [data-act=masuk]"));
  });
