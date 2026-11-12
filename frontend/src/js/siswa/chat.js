import { api } from "../api.js";
import { muatDariServer } from "../status.js";
import { materiSiswa } from "../seleksi.js";
import { catat } from "../status.js";
import { barisBertahap } from "../efek/teks.js";
import { $, elemen } from "../util.js";
import { status } from "../status.js";

export function tambahBubble(teks, kelas, sumber) {
  const box = $("#messages");
  const div = document.createElement("div");
  div.className = "bubble " + kelas;
  String(teks)
    .split("\n")
    .forEach((baris, i) => {
      if (i) div.append(elemen("br"));
      div.append(baris);
    });
  if (sumber) div.append(elemen("span", { class: "sumber" }, sumber));
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

export function sapaAwal() {
  const box = $("#messages");
  if (!box) return;
  if (box.querySelector(".bubble.me")) return;
  let div = box.querySelector('[data-sapa="1"]');
  if (!div) {
    div = elemen("div", { class: "bubble bot", "data-sapa": "1" });
    box.appendChild(div);
  }
  const daftar = materiSiswa();
  const kelas = status.pengguna ? `${status.pengguna.tingkat} ${status.pengguna.rombel}` : "";
  div.replaceChildren();
  if (!daftar.length) {
    div.append(
      "Belum ada materi untuk kelasmu. Minta guru mengunggah materi lebih dulu, ya.",
    );
  } else {
    const judul = daftar.slice(0, 2).map((m) => m.judul).join(", ");
    div.append(
      `Materi ${kelas}: ${judul}. Tanya apa saja soal materinya, atau minta saya jelaskan ulang bagian yang sulit.`,
    );
    div.append(
      elemen("span", { class: "sumber" }, `${daftar.length} materi tersedia`),
    );
  }
}

export function tambahMengetik() {
  const box = $("#messages");
  const div = document.createElement("div");
  div.className = "bubble bot mengetik";
  div.setAttribute("aria-label", "MugaMind sedang menyusun jawaban");
  div.append(elemen("i"), elemen("i"), elemen("i"));
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

export function isiBubble(el, teks, sumber) {
  if (!el) return;
  el.classList.remove("mengetik");
  el.replaceChildren(...barisBertahap(teks));
  if (sumber) el.append(elemen("span", { class: "sumber" }, sumber));
  const box = $("#messages");
  box.scrollTop = box.scrollHeight;
}

let mengirim = false;
export async function kirimChat(teksPaksa) {
  const input = $("#chatInput"),
    q = String(teksPaksa ?? input.value).trim();
  if (!q || mengirim) return;
  const account = status.pengguna?.id;
  mengirim = true;
  $("#s-chat").classList.add("bercakap");
  const button = document.querySelector("[data-act=kirimChat]");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  $("#chatStatus").textContent = "Sedang mencari jawaban dari materi kelasmu…";
  tambahBubble(q, "me");
  input.value = "";
  input.style.height = "auto";
  const nunggu = tambahMengetik();
  const mulai = performance.now();
  try {
    const hasil = await api.chat(q);
    const sisa = 620 - (performance.now() - mulai);
    if (sisa > 0) await new Promise((r) => setTimeout(r, sisa));
    if (status.pengguna?.id !== account) return;
    isiBubble(
      nunggu,
      hasil.jawaban,
      hasil.sumber
        ? "Sumber: " + hasil.sumber.mapel + " — " + hasil.sumber.judul
        : null,
    );
    const materi =
      hasil.sumber &&
      materiSiswa().find(
        (m) => m.mapel === hasil.sumber.mapel && m.judul === hasil.sumber.judul,
      );
    if (materi)
      nunggu.append(
        elemen(
          "button",
          {
            class: "btn ghost small",
            "data-act": "bacaMateri",
            "data-id": materi.id,
          },
          "Buka materi sumber",
        ),
      );
    await muatDariServer();
    if (status.pengguna?.id === account)
      {
        const kuota =
          typeof hasil.sisaKuota === "number"
            ? ` · sisa ${hasil.sisaKuota} pertanyaan hari ini`
            : "";
        $("#chatStatus").textContent =
          (hasil.sumber
            ? "Jawaban siap. Buka materi sumber untuk mempelajari lebih lanjut."
            : "Belum ditemukan jawaban yang sesuai dalam materi kelasmu.") + kuota;
      }
  } catch (e) {
    if (nunggu.isConnected) {
      nunggu.classList.add("eror");
      isiBubble(nunggu, e.message);
      nunggu.append(
        elemen(
          "button",
          { class: "btn ghost small", "data-act": "ulangChat", "data-q": q },
          "Coba lagi",
        ),
      );
      $("#chatStatus").textContent =
        "Jawaban belum tersedia. Coba kirim kembali.";
    }
  } finally {
    mengirim = false;
    if (button.isConnected) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
}
