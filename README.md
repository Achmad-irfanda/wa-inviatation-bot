# 📲 WhatsApp Invitation Automation Bot

Bot automasi untuk mengirim pesan undangan personal dan tautan grup WhatsApp secara otomatis ke daftar kontak menggunakan **Node.js** dan **Playwright**.

Dilengkapi dengan sistem **Anti-Ban** (jeda acak, istirahat berkala, rotasi template pesan acak), **ekstraksi nama panggilan pintar**, serta **penyimpanan sesi login otomatis** sehingga hanya perlu scan QR sekali.

---

## 📑 Daftar Isi

- [Fitur Utama](#-fitur-utama)
- [Struktur Direktori](#-struktur-direktori)
- [Persiapan Awal (Instalasi)](#-persiapan-awal-instalasi)
- [Konfigurasi](#-konfigurasi)
  - [1. Pengaturan Utama (`config.js`)](#1-pengaturan-utama-configjs)
  - [2. Template Pesan (`greeting-messages.json`)](#2-template-pesan-greeting-messagesjson)
  - [3. Daftar Kontak (`contact.json`)](#3-daftar-kontak-contactjson)
- [Cara Menjalankan](#-cara-menjalankan)
  - [Opsi A: Menggunakan Command `node`](#opsi-a-menggunakan-command-node)
  - [Opsi B: Menggunakan Shortcut `npm`](#opsi-b-menggunakan-shortcut-npm)
- [🔍 Pengecekan Anggota Grup & Follow-Up (H+2 / H+3)](#-pengecekan-anggota-grup--follow-up-h2--h3)
- [Mekanisme Anti-Ban & Keamanan Akun](#-mekanisme-anti-ban--keamanan-akun)
- [Pencatatan Riwayat (`history.json`)](#-pencatatan-riwayat-historyjson)
- [Troubleshooting / Tanya Jawab](#-troubleshooting--tanya-jawab)

---

## ✨ Fitur Utama

- 🔐 **Persistent Browser Session**: Cukup scan QR WhatsApp sekali, sesi tersimpan di folder `./wa_session` dan tidak perlu scan ulang setiap kali bot dijalankan.
- 🎲 **Rotasi Template Pesan Acak**: Mengacak variasi kalimat pesan untuk setiap kontak sehingga WhatsApp tidak mendeteksi pengiriman pesan seragam secara massal (spam).
- 🏷️ **Smart Name Formatting**:
  - `{{shortName}}`: Otomatis mengambil nama depan dengan format rapi (*Title Case*, misal `AZAHRA` $\rightarrow$ `Azahra`, dan cerdas menangani singkatan seperti `M Davied` $\rightarrow$ `Davied`).
  - `{{fullName}}`: Menampilkan nama lengkap asli kontak.
  - `{{link}}`: Tautan grup WhatsApp dari konfigurasi.
- ⏱️ **Human-like Delays**:
  - Jeda acak antar pesan (default 15–30 detik).
  - Jeda sebelum menekan tombol kirim (1.5–2.5 detik).
  - Istirahat berkala (*Batch Break*) setiap pengiriman N pesan (default istirahat 60–120 detik tiap 10 pesan).
- 🔍 **Group Member Checker (Strictly by Phone Number)**: Memindai anggota grup WhatsApp undangan secara otomatis dan membandingkannya berdasarkan nomor telepon dengan `contact.json` untuk mengetahui siapa yang belum bergabung.
- 🛡️ **Error Handling & Validasi**:
  - Melewati kontak yang nomor teleponnya kosong tanpa membuat script crash.
  - Menutup otomatis modal WhatsApp jika nomor tidak terdaftar.
- 💾 **Resume / Lanjut Kapan Saja**: Riwayat pengiriman dicatat di `history.json`. Jika bot dihentikan (`Ctrl + C`), kamu bisa menjalankannya lagi dan bot hanya akan memproses kontak yang belum terkirim.

---

## 📁 Struktur Direktori

```text
wa-inviatation-bot/
├── contact.example.json    # Template format kontak contoh
├── contact.json            # Daftar nomor dan nama kontak target (diabaikan git)
├── greeting-messages.json  # Variasi template pesan undangan
├── config.example.js       # Template konfigurasi contoh
├── config.js               # Pengaturan link, durasi delay, dll. (diabaikan git)
├── bot.js                  # Script automasi pengiriman pesan utama
├── check-group.js          # Script pengecekan anggota grup & pembanding nomor
├── pending-followup.json   # (Otomatis dibuat) Daftar kontak yang belum join grup
├── package.json            # Konfigurasi dependensi dan script npm
├── history.json            # (Otomatis dibuat) Catatan status pengiriman kontak
└── wa_session/             # (Otomatis dibuat) Penyimpanan sesi login WhatsApp Web
```

---

## 💻 Persiapan Awal (Instalasi)

Pastikan kamu sudah menginstal **Node.js** (rekomendasi versi 18 atau lebih baru).

Jalankan perintah berikut di terminal:

```bash
# 1. Masuk ke direktori project
cd wa-inviatation-bot

# 2. Install dependensi package
npm install

# 3. Download browser Chromium untuk Playwright (hanya perlu sekali)
npx playwright install chromium

# 4. Salin template kontak contoh ke contact.json
cp contact.example.json contact.json

# 5. Salin template config contoh ke config.js
cp config.example.js config.js
```

---

## ⚙️ Konfigurasi

### 1. Pengaturan Utama (`config.js`)
Buka file `config.js` untuk menyesuaikan parameter:

```javascript
export const config = {
  // Masukkan link grup undangan resmi di sini
  invitationLink: "https://chat.whatsapp.com/YOUR_GROUP_INVITE_LINK",

  // Rentang jeda acak (dalam detik) antar tiap pesan
  delay: {
    minSeconds: 15,
    maxSeconds: 30,
  },

  // Pengaturan jeda istirahat berkala (batch break)
  batch: {
    size: 10,              // Istirahat setiap mengirim 10 pesan
    breakMinSeconds: 60,   // Minimal istirahat (60 detik)
    breakMaxSeconds: 120,  // Maksimal istirahat (120 detik)
  },

  // Lokasi folder sesi login
  userDataDir: "./wa_session",

  // Buka browser visual agar bisa memantau
  headless: false,

  // Timeout maksimal untuk memuat elemen (milidetik)
  timeoutMs: 45000,
};
```

### 2. Template Pesan (`greeting-messages.json`)
Buka file [`greeting-messages.json`](greeting-messages.json). Kamu bisa menambah atau mengubah variasi template pesan.

Placeholder yang didukung:
- `{{shortName}}` : Nama panggilan/depan (contoh: *Billy*, *Azahra*).
- `{{fullName}}`  : Nama lengkap asli (contoh: *Billy Azaria Fatoni*).
- `{{link}}`      : Tautan yang diatur di `config.js`.

Contoh template:
```json
[
  "Salam hangat, *{{shortName}}*! 👋\n\nSelamat atas keberhasilan kamu lolos ke babak *Final*!\n\nSilakan bergabung ke grup koordinasi berikut:\n📌 {{link}}\n\nMohon konfirmasi data:\n• *Nama Lengkap:* {{fullName}}\n\nSampai jumpa di final! 🚀✨"
]
```

### 3. Daftar Kontak (`contact.json`)
Daftar target penerima disimpan dalam format JSON:
```json
[
  { "name": "Billy Azaria Fatoni", "phone": "6282337902699" },
  { "name": "Natwa Alifia Myoto", "phone": "" }
]
```
> *Catatan*: Nomor telepon menggunakan format kode negara tanpa tanda plus (misal: `62812...`). Jika `phone` kosong `""`, bot otomatis melewatinya.

---

## 🚀 Cara Menjalankan

Kamu bebas menggunakan perintah **`node`** langsung atau menggunakan shortcut **`npm`**.

### Opsi A: Menggunakan Command `node`

1. **Simulasi Pesan (Dry Run) — Cek tampilan pesan tanpa kirim:**
   ```bash
   node bot.js --dry-run
   ```

2. **Login & Simpan Sesi WA Saja (Scan QR):**
   ```bash
   node bot.js --login-only
   ```
   > Browser akan terbuka. Scan QR dengan HP. Setelah berhasil masuk, browser otomatis menutup dan sesi tersimpan di `./wa_session`.

3. **Mulai Pengiriman Otomatis:**
   ```bash
   node bot.js
   ```

---

### Opsi B: Menggunakan Shortcut `npm`

| Tujuan | Command `npm` | Sama dengan Command `node` |
| :--- | :--- | :--- |
| **Simulasi pesan** | `npm run dry-run` | `node bot.js --dry-run` |
| **Scan QR / Login saja** | `npm run login` | `node bot.js --login-only` |
| **Mulai kirim pesan** | `npm start` | `node bot.js` |
| **Cek anggota grup & komparasi** | `npm run check-group` | `node check-group.js` |

---

## 🔍 Pengecekan Anggota Grup & Follow-Up (H+2 / H+3)

Fitur ini digunakan beberapa hari setelah undangan disebar untuk mengetahui **siapa saja yang belum bergabung ke dalam grup**, sehingga kamu bisa melakukan pengiriman ulang (*follow-up*) secara tertarget tanpa mengganggu yang sudah join.

### 1. Cara Menjalankan Pengecekan
Jalankan:
```bash
node check-group.js
# atau
npm run check-group
```

**Alur Kerja:**
1. Browser akan membuka WhatsApp Web dengan sesi kamu.
2. Bot akan membuka obrolan grup (berdasarkan `groupName` di `config.js` atau kamu klik manual).
3. Bot membuka panel info grup dan memindai semua nomor anggota grup.
4. Bot membandingkan nomor anggota dengan `contact.json` **secara ketat berdasarkan nomor telepon** (format dinormalisasi ke `62xxx`).
5. Hasil kontak yang **belum masuk grup** otomatis disimpan ke file **`pending-followup.json`**.

### 2. Cara Mengirim Pesan Follow-Up
Setelah mendapatkan file `pending-followup.json`, kamu bisa langsung mengarahkan bot untuk mengirim pesan hanya ke mereka:
```bash
node bot.js --contacts pending-followup.json
```
*(Opsional: sesuaikan kalimat di `greeting-messages.json` dengan pesan pengingat follow-up sebelum mengirim).*

---

## 🛡️ Mekanisme Anti-Ban & Keamanan Akun

WhatsApp memiliki algoritma proteksi spam yang ketat terhadap pengiriman pesan massal. Bot ini menerapkan kaidah keselamatan:

1. **Jeda Dinamis (Random Delay)**: Interval antar pesan tidak monoton (bervariasi antara 15 hingga 30 detik).
2. **Istirahat Berkala (Batch Break)**: Setiap 10 pesan, bot beristirahat selama 1–2 menit menyerupai kebiasaan manusia.
3. **Variasi Konten (Spintax / Multi-template)**: Setiap kontak mendapatkan salah satu dari 5 template pesan yang dipilih secara acak.
4. **Kecepatan Manusia**: Ada jeda beberapa detik sebelum menekan tombol kirim agar pesan selesai diproses oleh antarmuka web WhatsApp.

---

## 📊 Pencatatan Riwayat (`history.json`)

Setiap kontak yang diproses akan langsung dicatat ke file `history.json` secara *real-time*:

```json
{
  "6282337902699": {
    "name": "Billy Azaria Fatoni",
    "status": "sent",
    "timestamp": "2026-11-07T14:35:00.000Z",
    "templateIndex": 2
  },
  "6289999999999": {
    "name": "Contoh Gagal",
    "status": "invalid_number",
    "timestamp": "2026-11-07T14:36:00.000Z"
  }
}
```

- **Jika proses berhenti di tengah jalan**: Kamu bisa langsung menjalankannya kembali (`node bot.js`), kontak yang bertanda `"sent"` tidak akan dikirimi pesan ulang.
- **Jika ingin mengirim ulang dari awal**: Cukup hapus file `history.json`.

---

## ❓ Troubleshooting / Tanya Jawab

- **Bagaimana cara menghentikan bot saat sedang berjalan?**  
  Tekan `Ctrl + C` di terminal. Progres yang sudah terkirim tidak akan hilang karena sudah tersimpan di `history.json`.
- **Apakah saya perlu scan QR setiap kali menjalankan bot?**  
  Tidak. Sesi login tersimpan di folder `./wa_session`. Selama folder tersebut tidak dihapus dan sesi tidak dikeluarkan dari HP, kamu tidak perlu scan lagi.
- **Bagaimana jika nomor kontak tidak terdaftar di WA?**  
  Bot akan mendeteksi popup error "Nomor telepon tidak valid", menutup modal tersebut, menandai statusnya sebagai `invalid_number` di `history.json`, lalu melanjutkan ke kontak berikutnya.
