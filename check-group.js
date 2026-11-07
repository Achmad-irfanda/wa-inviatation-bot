import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import readline from "readline";
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
const OUTPUT_FILE = path.join(__dirname, "pending-followup.json");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

// Normalisasi nomor telepon ke format 62xxx
function normalizePhone(raw) {
  if (!raw) return "";
  let digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("08")) {
    digits = "628" + digits.slice(2);
  }
  return digits;
}

async function main() {
  console.log("==================================================");
  console.log("🔍 WA GROUP MEMBER CHECKER & COMPARATOR");
  console.log("==================================================\n");

  if (!fs.existsSync(CONTACTS_FILE)) {
    console.error("❌ File contact.json tidak ditemukan!");
    process.exit(1);
  }

  const contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, "utf-8"));
  console.log(`📋 Total kontak target di contact.json: ${contacts.length}\n`);

  console.log("🌐 Membuka browser Chromium...");
  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    viewport: { width: 1280, height: 800 },
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log("📱 Membuka WhatsApp Web...");
  await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });

  console.log("⏳ Menunggu WhatsApp Web siap...");
  await page.waitForSelector(
    '#pane-side, div[aria-label="Chat list"], div[data-tab="3"], header[data-testid="chatlist-header"]',
    { timeout: 300000 }
  );
  console.log("✅ WhatsApp Web siap!\n");

  // Jika nama grup diatur di config.groupName, cari otomatis
  if (config.groupName && config.groupName.trim()) {
    console.log(`🔎 Mencari grup: "${config.groupName}"...`);
    try {
      const searchBox = page.locator('div[contenteditable="true"][data-tab="3"]').first();
      await searchBox.click();
      await searchBox.fill(config.groupName);
      await sleep(2000);

      // Klik hasil pencarian pertama
      const chatItem = page.locator(`span[title*="${config.groupName}"]`).first();
      if (await chatItem.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatItem.click();
        console.log(`✅ Obrolan grup "${config.groupName}" terbuka.`);
      } else {
        console.warn(`⚠️  Grup "${config.groupName}" tidak ditemukan via pencarian otomatis.`);
        console.log("👉 Silakan klik langsung grup tersebut di WhatsApp Web kamu.");
        await askQuestion("Tekan ENTER di terminal ini jika obrolan grup sudah terbuka di browser...");
      }
    } catch (e) {
      console.warn("⚠️  Silakan klik obrolan grup secara manual di browser.");
      await askQuestion("Tekan ENTER di terminal ini jika obrolan grup sudah terbuka di browser...");
    }
  } else {
    console.log("👉 Silakan KLIK obrolan grup yang ingin kamu periksa di WhatsApp Web.");
    await askQuestion("Tekan ENTER di terminal ini setelah obrolan grup terbuka di browser...");
  }

  // 1. Buka Informasi Grup (Group Info) dengan mengklik header
  console.log("\n📑 Membuka panel Informasi Grup...");
  try {
    const chatHeader = page.locator('#main header, header[data-testid="conversation-header"]').first();
    await chatHeader.click();
    await sleep(2000);
  } catch (err) {
    console.error("❌ Gagal mengklik header grup:", err.message);
  }

  // 2. Cari tombol "Lihat semua" / "View all" peserta jika ada
  console.log("👥 Mengumpulkan daftar peserta grup...");
  try {
    const viewAllBtn = page.locator(
      'div[role="button"]:has-text("Lihat semua"), button:has-text("Lihat semua"), div[role="button"]:has-text("View all"), button:has-text("View all"), div[role="button"]:has-text("lainnya"), div[role="button"]:has-text("more")'
    ).first();

    if (await viewAllBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      console.log("🔘 Mengklik tombol 'Lihat semua peserta'...");
      await viewAllBtn.click();
      await sleep(2000);
    }
  } catch (e) {
    // Abaikan jika tidak ada tombol lihat semua (peserta sedikit)
  }

  // 3. Ekstraksi seluruh nomor telepon dari panel info / modal daftar anggota
  const extractedNumbers = new Set();

  console.log("📜 Men-scroll dan memindai nomor telepon anggota...");

  // Identifikasi container daftar peserta
  const scrollableContainers = [
    'div[data-testid="drawer-middle"]',
    'div[role="region"]',
    'div[data-animate-modal-popup="true"]',
    'section',
  ];

  let scrollContainer = null;
  for (const sel of scrollableContainers) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      scrollContainer = el;
      break;
    }
  }

  // Fungsi pemindai teks pada halaman
  async function scanVisibleNumbers() {
    const elementsText = await page.evaluate(() => {
      const texts = [];
      // Ambil seluruh teks dan atribut title pada drawer/modal
      document.querySelectorAll('span, div[role="listitem"]').forEach((node) => {
        if (node.title) texts.push(node.title);
        if (node.innerText) texts.push(node.innerText);
      });
      return texts;
    });

    for (const text of elementsText) {
      if (!text) continue;
      // Cocokkan pola nomor telepon Indonesia: +62 xxx atau 08xxx atau 62xxx
      const matches = text.match(/(?:\+?62|08)[\d\s-]{7,15}/g);
      if (matches) {
        for (const m of matches) {
          const clean = normalizePhone(m);
          if (clean.length >= 10 && clean.length <= 15) {
            extractedNumbers.add(clean);
          }
        }
      }
    }
  }

  // Lakukan scroll bertahap untuk memuat peserta (jika virtualized list)
  for (let i = 0; i < 25; i++) {
    await scanVisibleNumbers();
    if (scrollContainer) {
      await scrollContainer.evaluate((el) => {
        el.scrollTop += 600;
      }).catch(() => {});
    }
    await sleep(400);
  }
  // Pindai sekali lagi di posisi akhir
  await scanVisibleNumbers();

  console.log(`\n📱 Total nomor telepon terdeteksi di dalam grup: ${extractedNumbers.size}`);

  // 4. Bandingkan dengan contact.json strictly by phone number
  const joinedContacts = [];
  const pendingFollowup = [];

  for (const contact of contacts) {
    const cleanPhone = normalizePhone(contact.phone);

    if (!cleanPhone) {
      // Lewati kontak tanpa nomor telepon
      continue;
    }

    if (extractedNumbers.has(cleanPhone)) {
      joinedContacts.push({
        ...contact,
        phone: cleanPhone,
      });
    } else {
      pendingFollowup.push({
        ...contact,
        phone: cleanPhone,
      });
    }
  }

  // 5. Simpan daftar yang belum join ke pending-followup.json
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pendingFollowup, null, 2), "utf-8");

  console.log("\n==================================================");
  console.log("📊 HASIL ANALISIS KEANGGOTAAN GRUP");
  console.log("==================================================");
  console.log(`👥 Total kontak target (dengan no HP) : ${joinedContacts.length + pendingFollowup.length}`);
  console.log(`✅ Sudah bergabung di grup           : ${joinedContacts.length}`);
  console.log(`⏳ BELUM bergabung (perlu follow-up)  : ${pendingFollowup.length}`);
  console.log(`💾 Data disimpan ke                   : pending-followup.json`);
  console.log("==================================================\n");

  if (pendingFollowup.length > 0) {
    console.log("Contoh 5 kontak yang belum bergabung:");
    pendingFollowup.slice(0, 5).forEach((c, idx) => {
      console.log(`  ${idx + 1}. ${c.name} (${c.phone})`);
    });
    if (pendingFollowup.length > 5) {
      console.log(`  ... dan ${pendingFollowup.length - 5} kontak lainnya.`);
    }
  } else {
    console.log("🎉 Luar biasa! Semua kontak target sudah bergabung ke dalam grup!");
  }

  console.log("\n💡 TIPS FOLLOW-UP (H+2 / H+3):");
  console.log("Kamu bisa menggunakan file 'pending-followup.json' sebagai daftar kontak");
  console.log("untuk pengiriman pesan pengingat follow-up tanpa mengganggu peserta yang sudah join.");

  await askQuestion("\nTekan ENTER untuk menutup browser...");
  await context.close();
}

main().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
