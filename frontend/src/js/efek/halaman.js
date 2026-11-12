import { gambarCincin, isiAngka } from "./angka.js";
export function jalankanEfek(id) {
  const p = document.getElementById(id);
  if (!p) return;
  isiAngka(p);
  gambarCincin(p);
}
export function tampilkanKerangka(id, lanjut) {
  lanjut();
}
export function tampilkanView(el, lanjut) {
  lanjut();
}
