import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Muat konfigurasi: prioritaskan config.js lokal, fallback ke config.example.js
let config;
const CONFIG_FILE = path.join(__dirname, "config.js");
const CONFIG_EXAMPLE_FILE = path.join(__dirname, "config.example.js");

if (fs.existsSync(CONFIG_FILE)) {
  const mod = await import("./config.js");
  config = mod.config;
} else if (fs.existsSync(CONFIG_EXAMPLE_FILE)) {
  const mod = await import("./config.example.js");
  config = mod.config;
} else {
  console.error("❌ File config.js atau config.example.js tidak ditemukan!");
  process.exit(1);
}

const CONTACTS_FILE = path.join(__dirname, "contact.json");
const MESSAGES_FILE = path.join(__dirname, "greeting-messages.json");
const HISTORY_FILE = path.join(__dirname, "history.json");

// Utility: sleep / delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Utility: random integer between min and max (inclusive)
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Load History
function loadHistory() {
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    } catch (e) {
      console.warn("⚠️  Gagal membaca history.json, membuat riwayat baru.");
      return {};
    }
  }
  return {};
}

// Save History
function saveHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
  } catch (e) {
    console.error("❌ Gagal menyimpan history.json:", e.message);
  }
}

// Ekstrak nama panggilan (shortName) secara pintar dan rapi (Title Case)
function getShortName(fullName) {
  if (!fullName) return "Kak";
  const parts = fullName.trim().split(/\s+/);
  let first = parts[0] || "Kak";

  // Jika kata pertama singkatan (misal: "M", "M.", "Muh"), gunakan kata berikutnya
  if (first.replace(/\./g, "").length <= 2 && parts.length > 1) {
    first = parts[1];
  }

  // Format ke Title Case: "AZAHRA" -> "Azahra", "cheryshava" -> "Cheryshava"
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// Format template dengan shortName, fullName, dan invitation link
function createMessage(template, fullName, link) {
  const cleanFullName = (fullName || "").trim();
  const shortName = getShortName(cleanFullName);

  return template
    .replaceAll("{{shortName}}", shortName)
    .replaceAll("{{fullName}}", cleanFullName)
    .replaceAll("{{name}}", cleanFullName)
    .replaceAll("{{link}}", (link || "").trim());
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const isLoginOnly = process.argv.includes("--login-only");

  console.log("==================================================");
  console.log("🚀 WA INVITATION BOT AUTOMATION (PLAYWRIGHT)");
  if (isDryRun) {
    console.log("🧪 MODE: DRY-RUN (Simulasi saja, tidak mengirim pesan)");
  } else if (isLoginOnly) {
    console.log("🔐 MODE: LOGIN ONLY (Hanya untuk scan QR dan simpan sesi)");
  }
  console.log("==================================================\n");

  if (isLoginOnly) {
    console.log("🌐 Membuka browser Chromium...");
    const context = await chromium.launchPersistentContext(config.userDataDir, {
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      viewport: { width: 1280, height: 800 },
    });
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    console.log("📱 Membuka WhatsApp Web...");
    await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });

    console.log("⏳ Silakan scan QR code di browser yang terbuka (timeout 10 menit)...");
    try {
      await page.waitForSelector(
        '#pane-side, div[aria-label="Chat list"], div[data-tab="3"], header[data-testid="chatlist-header"]',
        { timeout: 600000 }
      );
      console.log("\n🎉 BERHASIL LOGIN!");
      console.log("💾 Sesi login kamu telah tersimpan dengan aman di folder ./wa_session.");
      console.log("Kamu bisa menutup browser ini atau akan otomatis ditutup dalam 5 detik.");
      await sleep(5000);
      await context.close();
      console.log("✅ Siap! Kamu bisa menjalankan 'npm start' kapan pun pesan sudah siap.");
      return;
    } catch (err) {
      console.error("❌ Timeout menunggu scan QR code. Silakan coba lagi.");
      await context.close();
      process.exit(1);
    }
  }

  // 1. Baca Kontak
  if (!fs.existsSync(CONTACTS_FILE)) {
    console.error(`❌ File ${CONTACTS_FILE} tidak ditemukan! Silakan salin dari contact.example.json dan isi nomor target.`);
    process.exit(1);
  }
  const contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, "utf-8"));

  // 2. Baca Template Pesan
  if (!fs.existsSync(MESSAGES_FILE)) {
    console.error(`❌ File ${MESSAGES_FILE} tidak ditemukan!`);
    process.exit(1);
  }
  const templates = JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf-8"));
  if (!Array.isArray(templates) || templates.length === 0) {
    console.error("❌ File greeting-messages.json harus berupa array pesan dan tidak boleh kosong!");
    process.exit(1);
  }

  const history = loadHistory();

  // Filter kontak valid
  const pendingContacts = contacts.filter((c) => {
    const phone = (c.phone || "").trim().replace(/[^0-9]/g, "");
    if (!phone) return false;
    if (history[phone] && history[phone].status === "sent") return false;
    return true;
  });

  console.log(`📋 Total kontak di contact.json : ${contacts.length}`);
  console.log(`💬 Jumlah variasi template pesan : ${templates.length}`);
  console.log(`🔗 Link undangan saat ini       : ${config.invitationLink}`);
  console.log(`⏳ Kontak yang siap diproses     : ${pendingContacts.length}`);
  console.log(`✅ Kontak sudah terkirim (history): ${Object.values(history).filter(h => h.status === "sent").length}\n`);

  if (isDryRun) {
    console.log("--- CONTOH SIMULASI PESAN ---");
    pendingContacts.slice(0, 5).forEach((c, idx) => {
      const template = templates[idx % templates.length];
      const message = createMessage(template, c.name, config.invitationLink);
      console.log(`\n[Simulasi Kontak #${idx + 1}] -> ${c.name} (${c.phone}):`);
      console.log("-----------------------------------------");
      console.log(message);
      console.log("-----------------------------------------");
    });
    console.log("\n🧪 Dry-run selesai. Jalankan 'npm start' untuk mulai mengirim.");
    return;
  }

  if (pendingContacts.length === 0) {
    console.log("🎉 Semua kontak sudah pernah terkirim! Tidak ada kontak baru.");
    return;
  }

  // 3. Jalankan Browser Playwright dengan Persistent Context (session tersimpan)
  console.log("🌐 Membuka browser Chromium...");
  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: config.headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    viewport: { width: 1280, height: 800 },
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // Tangani interupsi (Ctrl+C) agar history tetap aman
  process.on("SIGINT", async () => {
    console.log("\n🛑 Menerima sinyal berhenti (SIGINT)... Menyimpan riwayat.");
    saveHistory(history);
    await context.close();
    process.exit(0);
  });

  console.log("📱 Membuka WhatsApp Web...");
  await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });

  console.log("⏳ Menunggu login WhatsApp Web (silakan scan QR jika belum login)...");
  try {
    // Indikator bahwa chat list sudah siap / user sudah login
    await page.waitForSelector(
      '#pane-side, div[aria-label="Chat list"], div[data-tab="3"], header[data-testid="chatlist-header"]',
      { timeout: 300000 }
    );
    console.log("✅ Berhasil login ke WhatsApp Web!\n");
  } catch (err) {
    console.error("❌ Timeout menunggu login WhatsApp Web. Silakan coba lagi.");
    await context.close();
    process.exit(1);
  }

  let sentInBatch = 0;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < pendingContacts.length; i++) {
    const contact = pendingContacts[i];
    const rawPhone = (contact.phone || "").trim();
    const phone = rawPhone.replace(/[^0-9]/g, "");
    const name = contact.name || "Teman";

    if (!phone) {
      console.log(`⏩ [SKIP] (${i + 1}/${pendingContacts.length}) ${name} - Nomor telepon kosong.`);
      continue;
    }

    // Pilih template secara acak
    const templateIndex = Math.floor(Math.random() * templates.length);
    const template = templates[templateIndex];
    const message = createMessage(template, name, config.invitationLink);

    console.log(`➡️  [${i + 1}/${pendingContacts.length}] Mengirim ke: ${name} (${phone}) [Template #${templateIndex + 1}]...`);

    const waUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

    try {
      await page.goto(waUrl, { waitUntil: "domcontentloaded" });

      // Selector untuk tombol kirim dan popup invalid number
      const sendButtonSelector = 'button[aria-label="Send"], button[data-testid="compose-btn-send"], span[data-icon="send"], button:has(span[data-icon="send"])';
      const errorPopupSelector = 'div[role="dialog"], div[data-animate-modal-popup="true"]';

      // Tunggu antara tombol kirim muncul ATAU muncul popup error
      const outcome = await Promise.race([
        page.waitForSelector(sendButtonSelector, { timeout: config.timeoutMs }).then(() => "ready"),
        page.waitForSelector(errorPopupSelector, { timeout: config.timeoutMs }).then(() => "invalid"),
      ]).catch(() => "timeout");

      if (outcome === "invalid") {
        console.warn(`⚠️  [INVALID] Nomor ${phone} (${name}) tidak terdaftar di WhatsApp.`);
        // Klik tombol OK pada popup jika ada
        const okBtn = page.locator('button:has-text("OK"), div[role="button"]:has-text("OK")').first();
        if (await okBtn.isVisible().catch(() => false)) {
          await okBtn.click();
        }
        history[phone] = {
          name,
          status: "invalid_number",
          timestamp: new Date().toISOString(),
        };
        saveHistory(history);
        failCount++;
        continue;
      }

      if (outcome === "timeout") {
        console.error(`❌ [TIMEOUT] Gagal memuat ruang chat untuk ${name} (${phone}).`);
        history[phone] = {
          name,
          status: "timeout_error",
          timestamp: new Date().toISOString(),
        };
        saveHistory(history);
        failCount++;
        continue;
      }

      // Jeda manusiawi sebelum klik tombol kirim
      await sleep(randomInt(1500, 2500));

      const sendBtn = page.locator(sendButtonSelector).first();
      if (await sendBtn.isVisible()) {
        await sendBtn.click();
      } else {
        // Fallback tekan Enter pada area teks
        await page.keyboard.press("Enter");
      }

      // Beri jeda 3 detik agar pesan terkirim dari web client
      await sleep(3000);

      history[phone] = {
        name,
        status: "sent",
        timestamp: new Date().toISOString(),
        templateIndex,
      };
      saveHistory(history);
      successCount++;
      sentInBatch++;

      console.log(`✅ [SUKSES] Pesan berhasil dikirim ke ${name} (${phone})`);

      // Cek apakah perlu istirahat batch (Batch Break)
      if (i < pendingContacts.length - 1) {
        if (sentInBatch >= config.batch.size) {
          const breakDuration = randomInt(config.batch.breakMinSeconds, config.batch.breakMaxSeconds);
          console.log(`\n☕ [BATCH BREAK] Mencapai ${sentInBatch} pesan. Istirahat sejenak selama ${breakDuration} detik agar aman dari blokir...\n`);
          await sleep(breakDuration * 1000);
          sentInBatch = 0;
        } else {
          // Jeda acak reguler antar pesan
          const delayDuration = randomInt(config.delay.minSeconds, config.delay.maxSeconds);
          console.log(`⏳ [JEDA] Menunggu ${delayDuration} detik sebelum mengirim pesan berikutnya...\n`);
          await sleep(delayDuration * 1000);
        }
      }
    } catch (sendErr) {
      console.error(`❌ [ERROR] Kesalahan saat mengirim ke ${name} (${phone}):`, sendErr.message);
      history[phone] = {
        name,
        status: "error",
        error: sendErr.message,
        timestamp: new Date().toISOString(),
      };
      saveHistory(history);
      failCount++;
    }
  }

  console.log("\n==================================================");
  console.log("🏁 PROSES SELESAI!");
  console.log(`✅ Berhasil terkirim : ${successCount}`);
  console.log(`❌ Gagal / Dilewati  : ${failCount}`);
  console.log(`📁 Catatan lengkap tersimpan di history.json`);
  console.log("==================================================");

  // Tunggu beberapa detik sebelum menutup browser
  await sleep(5000);
  await context.close();
}

main().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
