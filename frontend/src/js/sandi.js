// Tombol lihat/sembunyikan kata sandi.
// Dipisah dari main.js supaya tidak ikut penanganan aksi global yang menandai
// tombol sebagai "sedang bekerja" (aria-busy, data-pending) dan menonaktifkannya.

const LABEL_TAMPIL = "Tampilkan kata sandi";
const LABEL_SEMBUNYI = "Sembunyikan kata sandi";

function atur(btn, tampil) {
  const id = btn.dataset.lihatSandi;
  const input = document.getElementById(id);
  if (!input) return;

  const kursor = input.selectionStart;
  const kursorAkhir = input.selectionEnd;

  input.type = tampil ? "text" : "password";
  btn.setAttribute("aria-pressed", tampil ? "true" : "false");
  btn.setAttribute("aria-label", tampil ? LABEL_SEMBUNYI : LABEL_TAMPIL);
  btn.title = tampil ? LABEL_SEMBUNYI : LABEL_TAMPIL;

  // denyut cincin: kelas dilepas dulu supaya animasi bisa diputar ulang
  btn.classList.remove("berdenyut");
  void btn.offsetWidth;
  btn.classList.add("berdenyut");

  // kembalikan fokus ke isian, posisi kursor tetap
  input.focus({ preventScroll: true });
  try {
    input.setSelectionRange(kursor, kursorAkhir);
  } catch (e) {
    // isian yang tidak mendukung seleksi: tidak apa-apa
  }
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-lihat-sandi]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  atur(btn, btn.getAttribute("aria-pressed") !== "true");
});

// tekan dan tahan tombol "Enter" pada tombol ini tidak boleh mengirim form
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const btn = e.target.closest && e.target.closest("[data-lihat-sandi]");
  if (!btn) return;
  e.preventDefault();
  atur(btn, btn.getAttribute("aria-pressed") !== "true");
});
