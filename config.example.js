export const config = {
  // Masukkan link grup undangan resmi di sini
  invitationLink: "https://chat.whatsapp.com/YOUR_GROUP_INVITE_LINK",

  // Pengaturan jeda waktu acak (dalam detik) antar pengiriman pesan
  delay: {
    minSeconds: 15,
    maxSeconds: 30,
  },

  // Pengaturan jeda istirahat (batch break) untuk mencegah deteksi bot
  batch: {
    size: 10,              // Istirahat setiap mengirim N pesan
    breakMinSeconds: 60,   // Durasi minimal istirahat (detik)
    breakMaxSeconds: 120,  // Durasi maksimal istirahat (detik)
  },

  // Folder penyimpanan session WhatsApp Web (agar tidak perlu scan QR terus-menerus)
  userDataDir: "./wa_session",

  // Headless false agar browser terbuka dan user bisa memantau / scan QR
  headless: false,

  // Timeout maksimal untuk menunggu elemen halaman (milidetik)
  timeoutMs: 45000,
};
