import { api } from "./api.js";
import { status } from "./status.js";
import { $, elemen } from "./util.js";
import { bukaModal, tutupModal, toast } from "./ui.js";

let accounts = [],
  offset = 0,
  auditOffset = 0,
  version = 0;
export function resetAdmin() {
  accounts = [];
  offset = auditOffset = 0;
  version++;
}
const roleName = (role) =>
  ({ siswa: "Siswa", guru: "Guru", admin: "Administrator" })[role] || role;
const actions = {
  admin_account_created: "Akun dibuat",
  admin_account_updated: "Identitas, peran atau status diperbarui",
  admin_password_reset: "Kata sandi direset",
  admin_assignments_updated: "Penugasan guru diperbarui",
};
const button = (label, act, id, primary = false) =>
  elemen(
    "button",
    {
      type: "button",
      class: "btn " + (primary ? "primary" : "ghost") + " small",
      "data-act": act,
      "data-id": id,
    },
    label,
  );
const field = (label, input, help) => {
  if (!input.hasAttribute("aria-label"))
    input.setAttribute("aria-label", label);
  return elemen(
    "label",
    {},
    label,
    input,
    help ? elemen("span", { class: "small muted" }, help) : null,
  );
};
function select(options, value = "") {
  const el = elemen(
    "select",
    {},
    options.map(([v, label]) => elemen("option", { value: v }, label)),
  );
  el.value = value;
  return el;
}
function password(label = "Kata sandi admin") {
  return elemen("input", {
    type: "password",
    required: true,
    maxlength: 256,
    autocomplete:
      label === "Kata sandi admin" ? "current-password" : "new-password",
    "aria-label": label,
  });
}
function account(id) {
  return accounts.find((u) => u.id === id);
}
function editable(id) {
  const u = account(id);
  if (!u || u.peran === "admin")
    throw new Error("Akun administrator dikelola melalui operator server");
  return u;
}

export async function renderAdmin() {
  if (status.role !== "admin" || status.pengguna.wajibGantiSandi) return;
  const ticket = ++version,
    owner = status.pengguna.id;
  const form = $("#adminCariForm");
  form.onsubmit = (e) => {
    e.preventDefault();
    offset = 0;
    renderAdmin().catch(showPageError);
  };
  const query = { q: $("#adminCari").value.trim(), offset, limit: 25 };
  if ($("#adminFilter").value) query.peran = $("#adminFilter").value;
  $("#adminCount").textContent = "Memuat akun…";
  const [data, summary] = await Promise.all([
    api.adminAkun(query),
    api.adminRingkasan(),
  ]);
  if (ticket !== version || status.pengguna?.id !== owner) return;
  accounts = data.items;
  $("#adminKpi").replaceChildren(
    ...[
      ["Siswa", summary.siswa],
      ["Guru", summary.guru],
      ["Administrator", summary.admin],
      ["Akun nonaktif", summary.nonaktif],
    ].map(([name, value]) =>
      elemen(
        "div",
        { class: "card stat" },
        elemen(
          "div",
          {},
          elemen("span", { class: "small muted" }, name),
          elemen("div", { class: "n" }, String(value)),
        ),
      ),
    ),
  );
  $("#adminPerhatian").textContent = summary.tanpaPenugasan
    ? `${summary.tanpaPenugasan} guru belum memiliki penugasan. Guru memerlukan mapel dan kelas sebelum dapat mengajar melalui MugaMind.`
    : "Semua akun guru sudah memiliki penugasan mengajar.";
  $("#adminCount").textContent = data.total
    ? `${offset + 1}–${Math.min(offset + 25, data.total)} dari ${data.total} akun`
    : "Tidak ada akun yang sesuai pencarian.";
  $("#adminPrev").disabled = offset === 0;
  $("#adminNext").disabled = offset + 25 >= data.total;
  $("#adminDaftar").replaceChildren(
    ...accounts.map((u) =>
      elemen(
        "article",
        { class: "list-item admin-account" },
        elemen(
          "div",
          { class: "admin-account-info" },
          elemen("h3", {}, u.nama),
          elemen("p", { class: "small muted" }, u.email || "Tanpa email"),
          elemen(
            "div",
            { class: "btnrow" },
            elemen("span", { class: "tag" }, roleName(u.peran)),
            elemen("span", { class: "tag" }, u.aktif ? "Aktif" : "Nonaktif"),
            u.peran === "siswa"
              ? elemen("span", { class: "tag" }, `${u.tingkat} ${u.rombel}`)
              : null,
          ),
          u.peran === "guru"
            ? elemen(
                "p",
                { class: "small" },
                u.penugasan
                  .map((t) => `${t.mapel} · ${t.tingkat} ${t.rombel}`)
                  .join("; ") || "Belum ada penugasan",
              )
            : null,
          u.wajibGantiSandi
            ? elemen(
                "p",
                { class: "small muted" },
                "Wajib mengganti kata sandi sementara",
              )
            : null,
        ),
        elemen(
          "div",
          { class: "btnrow" },
          ...(u.peran === "admin"
            ? [
                elemen(
                  "span",
                  { class: "small muted" },
                  "Dikelola operator server",
                ),
              ]
            : [
                button("Edit akun", "adminEdit", u.id),
                ...(u.peran === "guru"
                  ? [button("Atur penugasan", "adminPenugasan", u.id)]
                  : []),
                button("Reset sandi", "adminReset", u.id),
              ]),
        ),
      ),
    ),
  );
}
function showPageError(e) {
  if (status.role !== "admin") return;
  $("#pageError").textContent = e.message;
  $("#pageError").hidden = false;
}
export async function renderAudit() {
  if (status.role !== "admin") return;
  const owner = status.pengguna.id,
    ticket = ++version;
  const data = await api.adminAudit(auditOffset);
  if (status.pengguna?.id !== owner || ticket !== version) return;
  $("#adminAuditCount").textContent =
    `${data.total} perubahan tercatat · pelaku dan target menggunakan ID akun`;
  const navLog = $("#adminLogPrev")?.closest(".btnrow");
  if (navLog) navLog.hidden = !data.total;
  $("#adminLogPrev").disabled = auditOffset === 0;
  $("#adminLogNext").disabled = auditOffset + 25 >= data.total;
  $("#adminAuditList").replaceChildren(
    ...(data.items.length
      ? data.items.map((x) =>
          elemen(
            "article",
            { class: "list-item" },
            elemen(
              "div",
              {},
              elemen("b", {}, actions[x.aksi] || x.aksi),
              elemen(
                "p",
                { class: "small muted" },
                `Admin #${x.actor} → akun #${x.target}`,
              ),
            ),
            elemen(
              "time",
              { class: "small muted" },
              new Date(x.waktu).toLocaleString("id-ID"),
            ),
          ),
        )
      : [
          elemen(
            "p",
            { class: "muted" },
            "Belum ada perubahan dari panel admin.",
          ),
        ]),
  );
}
function mutationForm(
  title,
  content,
  submit,
  perform,
  help = "Semua sesi akun yang diubah akan diakhiri. Pengguna perlu masuk kembali.",
) {
  const secret = password(),
    error = elemen("p", { class: "form-error", role: "alert", hidden: true });
  const save = elemen(
    "button",
    { class: "btn primary", type: "submit" },
    submit,
  );
  const form = elemen(
    "form",
    { class: "admin-form" },
    content,
    elemen("p", { class: "small muted" }, help),
    field(
      "Konfirmasi kata sandi admin",
      secret,
      "Masukkan kata sandimu untuk menyetujui perubahan ini.",
    ),
    error,
    save,
  );
  const owner = status.pengguna.id;
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (save.disabled) return;
    save.disabled = true;
    error.hidden = true;
    try {
      await perform(secret.value);
      if (status.pengguna?.id !== owner) return;
      tutupModal();
      toast("Perubahan tersimpan. Sesi akun terkait telah diperbarui.");
      await renderAdmin();
    } catch (e) {
      if (form.isConnected) {
        error.textContent = e.message;
        error.hidden = false;
      }
    } finally {
      secret.value = "";
      save.disabled = false;
    }
  };
  bukaModal("Administrasi sekolah", title, form);
}
function editAccount(u) {
  const nama = elemen("input", {
    required: true,
    maxlength: 150,
    value: u?.nama || "",
    autocomplete: "off",
  });
  const email = elemen("input", {
    type: "email",
    required: true,
    maxlength: 255,
    value: u?.email || "",
    autocomplete: "off",
  });
  const role = select(
    [
      ["siswa", "Siswa"],
      ["guru", "Guru"],
    ],
    u?.peran || "siswa",
  );
  const tingkat = select(
    ["VII", "VIII", "IX"].map((x) => [x, x]),
    u?.tingkat || "VIII",
  );
  const rombel = select(
    ["A", "B", "C", "D", "E", "F"].map((x) => [x, x]),
    u?.rombel || "A",
  );
  const kelas = elemen(
    "div",
    { class: "grid g2" },
    field("Tingkat", tingkat),
    field("Rombel", rombel),
  );
  const roleChanged = () => {
    kelas.hidden = role.value !== "siswa";
  };
  role.onchange = roleChanged;
  roleChanged();
  const aktif = select(
    [
      ["true", "Aktif"],
      ["false", "Nonaktif"],
    ],
    u?.aktif === false ? "false" : "true",
  );
  const temp = !u ? password("Kata sandi sementara") : null;
  if (temp) temp.minLength = 12;
  const content = [
    field("Nama lengkap", nama),
    field("Email login", email),
    field("Peran", role),
    kelas,
    field(
      "Status akun",
      aktif,
      "Nonaktif menghentikan akses tanpa menghapus data.",
    ),
    u
      ? elemen(
          "p",
          { class: "small muted" },
          "Mengubah peran akan menghapus penugasan guru lama. Jika menjadi guru, atur penugasannya setelah disimpan.",
        )
      : field(
          "Kata sandi sementara (minimal 12 karakter)",
          temp,
          "Sampaikan secara pribadi. Pengguna wajib menggantinya saat pertama masuk.",
        ),
  ];
  mutationForm(
    u ? "Edit akun" : "Tambah akun",
    content,
    u ? "Simpan perubahan" : "Buat akun",
    async (adminPassword) => {
      const data = {
        nama: nama.value.trim(),
        email: email.value.trim(),
        peran: role.value,
        tingkat: role.value === "siswa" ? tingkat.value : null,
        rombel: role.value === "siswa" ? rombel.value : null,
        aktif: aktif.value === "true",
        adminPassword,
      };
      if (u) await api.adminUbah(u.id, data);
      else await api.adminBuat({ ...data, password: temp.value });
    },
  );
}
function assignments(u) {
  const rows = elemen("div", { class: "admin-assignment-rows" });
  const addRow = (t = {}) => {
    const mapel = elemen("input", {
      required: true,
      maxlength: 100,
      value: t.mapel || "",
      placeholder: "Contoh: IPA",
    });
    const tingkat = select(
        ["VII", "VIII", "IX"].map((x) => [x, x]),
        t.tingkat || "VIII",
      ),
      rombel = select(
        ["A", "B", "C", "D", "E", "F"].map((x) => [x, x]),
        t.rombel || "A",
      );
    const remove = elemen(
      "button",
      { type: "button", class: "btn ghost small" },
      "Hapus baris",
    );
    const row = elemen(
      "div",
      { class: "admin-assignment-row" },
      field("Mata pelajaran", mapel),
      field("Tingkat", tingkat),
      field("Rombel", rombel),
      remove,
    );
    row.getData = () => ({
      mapel: mapel.value.trim(),
      tingkat: tingkat.value,
      rombel: rombel.value,
    });
    remove.onclick = () => row.remove();
    rows.append(row);
  };
  u.penugasan.forEach(addRow);
  const add = elemen(
    "button",
    { type: "button", class: "btn ghost" },
    "+ Tambah penugasan",
  );
  add.onclick = () => {
    if (rows.children.length < 60) addRow();
  };
  mutationForm(
    "Penugasan · " + u.nama,
    [
      elemen(
        "p",
        {},
        "Setiap baris memberikan akses ke satu mata pelajaran dan satu kelas. Gunakan nama mapel yang sama persis dengan materi.",
      ),
      rows,
      add,
    ],
    "Simpan penugasan",
    async (adminPassword) => {
      if (
        !rows.children.length &&
        !confirm(
          "Hapus seluruh penugasan? Guru tidak dapat login sampai mendapat penugasan baru.",
        )
      )
        throw new Error("Penugasan belum diubah.");
      await api.adminTugas(u.id, {
        adminPassword,
        penugasan: [...rows.children].map((row) => row.getData()),
      });
    },
  );
}
export const adminActions = {
  adminTambah() {
    if (status.role === "admin") editAccount();
  },
  adminEdit(el) {
    editAccount(editable(el.dataset.id));
  },
  adminPenugasan(el) {
    assignments(editable(el.dataset.id));
  },
  adminReset(el) {
    const u = editable(el.dataset.id),
      temp = password("Kata sandi sementara");
    temp.minLength = 12;
    mutationForm(
      "Reset sandi · " + u.nama,
      [
        field(
          "Kata sandi sementara (minimal 12 karakter)",
          temp,
          "Sampaikan secara pribadi. Pengguna wajib menggantinya sebelum melanjutkan.",
        ),
      ],
      "Reset dan akhiri sesi",
      (adminPassword) =>
        api.adminReset(u.id, { adminPassword, password: temp.value }),
    );
  },
  adminSebelum() {
    offset = Math.max(0, offset - 25);
    return renderAdmin();
  },
  adminSesudah() {
    offset += 25;
    return renderAdmin();
  },
  adminLogPrev() {
    auditOffset = Math.max(0, auditOffset - 25);
    return renderAudit();
  },
  adminLogNext() {
    auditOffset += 25;
    return renderAudit();
  },
};
