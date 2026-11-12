"""Extractive answers: select evidence, match intents, flexible keywords, never invent an explanation."""
import re

STOP = set("""
ada adalah adanya adapun agak agar akan akibat akibatnya aktivitas
aku anda antara apa apaan apakah artinya atau awal awalnya
bab baca badan bagian bagi bagaimanapun bagaimana bagaimanakah bahkan bahwa baik banyak
bantu bantuin bapak beberapa bemai benar berada berapa berikan berikut berupa
berarti berbagai berlangsung bersama bersangkutan besar bisa boleh bot buat buku bukan
cara catatan coba contoh contohnya cukup cuma
dalam dan dapat dari daripada deh dekat dengan depan di dia diatas dibawah
dimana dimanakah diri dirinya dong dua
fakta fungsi fungsinya
garis guna gunakan
hal halaman halo hai hanya harus hasil hasilnya hingga
ia ialah ikhtisar info informasi ini ingin intisari intinya ipa ips isi istilah itu
jadi jawab jawaban jelas jelasin jelaskan jika judul juga justru
kadang kak kalau kami kamu kan kapan karena kasih ke kedua kelima keluar kemana kemudian kenapa kenapakah kesimpulan ketiga ketika kita kok kurang kurikulum
lagi lain lainnya lalu lambat langkah lanjut lebih lewat loh luas luar
macam maka makin makna mampu mana manakah manfaat mari masa masalah masing maksud maksudnya mata matematika materi mau maupun mekanisme melainkan melalui memang memuat mengenai mengapa mengapakah menjadi merasa mereka meski meskipun min minta misalnya modul mohon mtk mulai maupun
nah nanti nih nomor nya
olah oleh orang
pada padahal pak pelajaran paparkan pasti pekerja pelaksanaan pembelajaran pemahaman pembahasan pemberian pengertian penting per peran peranan perbedaan perlu pernah pertama pokok proses prosesnya punya pun
ragu rangka rangkum rangkuman ringkas ringkasan rincian rinci rumus ruang
saat saja salah sambil sampai samping sang sangat satu saya sebab sebagai sebagian sebaiknya sebelum sebuah secara sedang sedikit sehingga selain selalu seluruh semacam semakin sementara semua semisal sendiri seputar seorang seorangpun seperti serentak serta sesuai sesuatu sebutkan sebutkanlah segala sesudah setelah setiap siapa siapakah sih singkat singkatnya sini siswa soal soalnya suatu sudah sumber supaya
tahu tahukah tahun tak tanda tanpa tanya tapi telah tema tempat tentang tentu tepat terangkan terakhir terhadap terdapat terjadi terjadinya terkait termasuk tersebut tertentu terus tetapi tiap tidak timbul titik toh tolong tolonglah topik tugas tujuan tuh
umum untuk urutan usai utama
vs versus
wah waktu walau walaupun wujud
ya yaitu yakni yang
lengkap lengkapnya dimaksud langsung detail detailnya rinci rincinya
""".split())

ALIASES = {
    "bernapas": "napas",
    "pernapasan": "napas",
    "pernafasan": "napas",
    "nafas": "napas",
    "alveoli": "alveolus",
    "olahraga": "olahraga",
    "berolahraga": "olahraga",
    "inspirasi": "inspirasi",
    "ekspirasi": "ekspirasi",
}

MARKERS = {
    "sebab": r"karena|sebab|sehingga|akibat|menyebabkan|agar|untuk|membantu",
    "fungsi": r"fungsi|berperan|berguna|untuk|tempat|membantu|menyaring|menghasilkan|memompa|mengangkut|melindungi|mengatur",
    "definisi": r"adalah|merupakan|disebut|berarti|yaitu|yakni|ialah",
    "proses": r"saat|ketika|kemudian|lalu|menjadi|berkontraksi|relaksasi|berdifusi|mengalir|masuk|keluar|melalui",
    "contoh": r"contoh|misalnya|seperti|antara lain",
}


def clean_word(w):
    w = w.lower().strip()
    if w in ALIASES:
        return ALIASES[w]
    for suf in ["lah", "kah", "pun", "nya", "ku", "mu"]:
        if len(w) > len(suf) + 3 and w.endswith(suf):
            w = w[:-len(suf)]
            break
    if w in ALIASES:
        return ALIASES[w]
    return w


def tokens(text):
    words = re.findall(r"[\w]+", text.lower())
    res = set()
    for raw in words:
        w = clean_word(raw)
        if len(w) > 1 and w not in STOP:
            res.add(w)
    return res


def intent(question):
    q = question.lower()
    if re.search(r"\b(mengapa|kenapa|alasan|penyebab|akibat)\b", q):
        return "sebab"
    if re.search(r"\b(fungsi\w*|kegunaan|manfaat|tujuan|peran\w*)\b", q):
        return "fungsi"
    if re.search(r"\b(contoh\w*)\b", q):
        return "contoh"
    if re.search(r"\b(perbedaan|beda|bandingkan|versus|vs)\b", q):
        return "perbandingan"
    if re.search(r"\b(bagaimana|proses|cara|urutan|langkah|mekanisme)\b", q):
        return "proses"
    if re.search(r"\b(apa itu|pengertian|definisi|arti|maksud|apa yang dimaksud)\b", q):
        return "definisi"
    return "fakta"


def subject_bonus(keys, sentence):
    s = sentence.lower().strip()
    bonus = 0
    for k in keys:
        if s.startswith(k):
            bonus += 25
        if re.search(rf"\b{re.escape(k)}\s+(adalah|merupakan|yaitu|berfungsi|ialah)\b", s):
            bonus += 20
    return bonus


def _mirip(a: str, b: str) -> bool:
    if a == b:
        return True
    if len(a) < 4 or len(b) < 4:
        return False
    return a in b or b in a


def relevan(question, materials):
    """Apakah pertanyaan menyinggung isi materi sama sekali.

    Memblokir pertanyaan di luar topik tanpa memanggil AI (hemat token).
    """
    keys = tokens(question)
    if not keys:
        return False
    punya = set()
    for m in materials:
        punya |= tokens(getattr(m, "judul", "") or "")
        for p in m.teks:
            punya |= tokens(p)
        for g in getattr(m, "gambar", None) or []:
            punya |= tokens(g.get("keterangan", ""))
    if keys & punya:
        return True
    # 'napas' menempel pada 'pernapasan': satu kata kunci harus utuh di materi.
    return any(
        k in w or w in k
        for k in keys
        if len(k) >= 5
        for w in punya
        if len(w) >= 5
    )


def pilih_konteks(question, materials, maks=5):
    """Ambil paragraf paling relevan sebagai bahan jawaban AI."""
    keys = tokens(question)
    pilihan = []
    for m in materials:
        judul = getattr(m, "judul", "") or ""
        skor_judul = len(keys & tokens(judul))
        teks_semua = list(m.teks) + [
            "Gambar: " + (g.get("keterangan") or "")
            for g in (getattr(m, "gambar", None) or [])
            if g.get("keterangan")
        ]
        for i, par in enumerate(teks_semua):
            hits = keys & tokens(par)
            if not hits:
                continue
            skor = len(hits) * 10 + skor_judul * 4 - i * 0.01
            pilihan.append((skor, judul, par))
    pilihan.sort(key=lambda x: -x[0])
    hasil, dipakai = [], set()
    for skor, judul, par in pilihan:
        kunci = par[:80]
        if kunci in dipakai:
            continue
        dipakai.add(kunci)
        hasil.append(f"[{judul}] {par}")
        if len(hasil) >= maks:
            break
    return "\n\n".join(hasil)


def pilih_jawaban(question, materials):
    """Materials must already be filtered by server authorization."""
    materials = list(materials)
    if not materials:
        return None, "Belum ada materi pembelajaran yang tersedia."

    q_raw = question.strip()
    q_lower = re.sub(r"[-_.]+", " ", q_raw.lower()).strip()
    keys, kind = tokens(q_raw), intent(q_raw)

    # Conversational greeting detection
    if re.match(r"^(halo|hai|pagi|siang|sore|malam|assalamualaikum|assalamu'alaikum)\b", q_lower):
        return None, "Halo! Saya MugaMind, asisten belajarmu. Tanyakan konsep, istilah, atau fungsi materi kelasmu (misalnya: 'Apa fungsi alveolus?' atau 'Jelaskan materi sistem pernapasan')."

    is_summary_req = bool(
        re.search(
            r"\b(jelaskan|rangkum\w*|ringkas\w*|ikhtisar|garis besar|kesimpulan|materi|tentang|isi)\b",
            q_lower,
        )
    )

    # 1. Whole material overview or title match
    for m in materials:
        judul = getattr(m, "judul", "") or ""
        norm_judul = re.sub(r"[-_.]+", " ", judul.lower()).strip()
        judul_tokens = tokens(judul)
        if norm_judul and (
            norm_judul in q_lower
            or (is_summary_req and judul_tokens and judul_tokens.issubset(keys))
        ):
            points = getattr(m, "rangkuman", None) or (
                m.teks[:3] if len(m.teks) >= 3 else m.teks
            )
            if points:
                ans = "\n".join(points) if isinstance(points, list) else str(points)
                return m, ans

    if not keys:
        return None, "Sebutkan topik yang ingin kamu tanyakan, misalnya: Apa fungsi alveolus?"

    # Check for foreign/unsupported terms
    all_mat_tokens = set()
    for m in materials:
        judul = getattr(m, "judul", "") or ""
        all_mat_tokens |= tokens(judul)
        for p in m.teks:
            all_mat_tokens |= tokens(p)

    unknown_keys = keys - all_mat_tokens
    if unknown_keys:
        return None, "Saya belum menemukan penjelasan yang menjawab pertanyaan itu dalam materi kelasmu. Coba sebutkan istilah yang ada di materi atau tanyakan kepada guru."

    best = None
    for m in materials:
        candidates = []
        for paragraph in m.teks:
            sentences = [
                s.strip()
                for s in re.split(r"(?<=[.!?])\s+|\n+", paragraph)
                if s.strip()
            ]
            for index, sentence in enumerate(sentences):
                hits = keys & tokens(sentence)
                if not hits:
                    continue
                window = sentence
                if not keys.issubset(tokens(window)) and index + 1 < len(sentences):
                    window += " " + sentences[index + 1]
                w_tokens = tokens(window)
                w_hits = keys & w_tokens
                if not w_hits:
                    continue

                is_subset = keys.issubset(w_tokens)
                if not is_subset and len(w_hits) / len(keys) < 0.5:
                    continue

                marker = MARKERS.get(kind)
                has_marker = bool(marker and re.search(marker, window.lower()))
                if marker and not has_marker:
                    if index + 1 < len(sentences):
                        window = sentence + " " + sentences[index + 1]
                        has_marker = bool(re.search(marker, window.lower()))
                    if not has_marker:
                        if kind in ("contoh", "sebab", "definisi", "fungsi"):
                            continue

                if kind == "perbandingan" and len(keys) < 2:
                    continue

                score = (
                    (len(w_hits) / len(keys)) * 40
                    + (30 if is_subset else 0)
                    + (20 if has_marker else 0)
                    + subject_bonus(keys, sentence)
                    - len(window) / 1000
                )
                candidates.append((score, window))

        # Comparisons fallback
        if not candidates and kind == "perbandingan" and len(keys) >= 2:
            selected, covered = [], set()
            for paragraph in m.teks:
                for sentence in re.split(r"(?<=[.!?])\s+|\n+", paragraph):
                    hits = keys & tokens(sentence)
                    if hits - covered:
                        selected.append(sentence.strip())
                        covered |= hits
            if keys <= covered and len(selected) <= 3:
                candidates.append((len(keys) * 10, "\n".join(selected)))

        if candidates:
            score, answer = max(candidates, key=lambda item: item[0])
            if best is None or score > best[0]:
                best = score, m, answer

    if best:
        return best[1], best[2]
    return None, "Saya belum menemukan penjelasan yang menjawab pertanyaan itu dalam materi kelasmu. Coba sebutkan istilah yang ada di materi atau tanyakan kepada guru."
