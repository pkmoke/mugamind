import { $, $$ } from "../util.js";
import { tenang } from "./inti.js";

export function naikkanAngka(el, target) {
  if (!el || el.dataset.jalan === "1") return;
  el.dataset.jalan = "1";
  if (tenang()) {
    el.textContent = target;
    return;
  }
  const awal = performance.now();
  let selesai = false;
  const langkah = () => {
    if (selesai) return;
    const p = Math.min((performance.now() - awal) / 700, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p >= 1) {
      selesai = true;
      el.textContent = target;
      clearInterval(penjaga);
    }
  };
  const penjaga = setInterval(langkah, 80);
  const lukis = () => {
    langkah();
    if (!selesai) requestAnimationFrame(lukis);
  };
  requestAnimationFrame(lukis);
}

export function isiAngka(akar) {
  $$("[data-angka]", akar).forEach((el) =>
    naikkanAngka(el, Number(el.dataset.angka)),
  );
  $$("[data-lebar]", akar).forEach((el, i) =>
    setTimeout(
      () => {
        el.style.width = el.dataset.lebar + "%";
      },
      70 + i * 80,
    ),
  );
}

export function gambarCincin(akar) {
  $$(".skor-ring[data-p]", akar).forEach((ring) => {
    ring.style.setProperty("--p", 0);
    setTimeout(() => ring.style.setProperty("--p", ring.dataset.p), 90);
  });
}
