require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = process.env.TELEGRAM_ADMIN_ID;

const bot = new Telegraf(token);
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.txt');

// State untuk bot
let isRunning = false;
let addingAccountState = false;
let selectedEmails = new Set();
let currentAccountsList = [];
const TARGET_ACCOUNTS_FILE = path.join(__dirname, 'target_accounts.txt');

// Middleware ngecek admin
bot.use(async (ctx, next) => {
  if (ctx.from && ctx.from.id.toString() !== adminId) {
    return ctx.reply('Maaf, lu bukan majikan gue.');
  }
  return next();
});

const showMenu = async (ctx) => {
  await ctx.reply('Pilih menu command di bawah:', 
    Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Login Semua Akun', 'run_bot_all')],
      [Markup.button.callback('☑️ Pilih Akun & Login', 'select_accounts')],
      [Markup.button.callback('📋 Cek Akun', 'check_account')],
      [Markup.button.callback('➕ Tambah Akun', 'add_account')],
      [Markup.button.callback('🗑 Hapus Semua Akun', 'delete_account')]
    ])
  );
};

const renderSelectionMenu = async (ctx) => {
  let buttons = [];
  for (let i = 0; i < currentAccountsList.length; i++) {
    let email = currentAccountsList[i];
    let username = email.split('@')[0];
    let text = selectedEmails.has(email) ? `☑️ ${username}` : username;
    buttons.push(Markup.button.callback(text, `toggle_${i}`));
  }
  
  let rows = [];
  for (let i=0; i<buttons.length; i++) {
    rows.push([buttons[i]]);
  }
  rows.push([Markup.button.callback('▶️ Mulai Login (Terpilih)', 'run_bot_selected')]);
  rows.push([Markup.button.callback('🔙 Kembali', 'back_menu')]);
  
  const markup = Markup.inlineKeyboard(rows);
  if (ctx.callbackQuery) {
    await ctx.editMessageText('Pilih akun yang mau dilogin:', markup).catch(()=>{});
  } else {
    await ctx.reply('Pilih akun yang mau dilogin:', markup);
  }
};

bot.command(['start', 'menu'], async (ctx) => {
  await showMenu(ctx);
});

// Handle text input (buat fitur nambah akun)
bot.on('text', async (ctx) => {
  if (addingAccountState && ctx.message.text && !ctx.message.text.startsWith('/')) {
    const lines = ctx.message.text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
    if (lines.length > 0) {
      fs.appendFileSync(ACCOUNTS_FILE, lines.join('\n') + '\n', 'utf8');
      await ctx.reply(`✅ ${lines.length} Akun berhasil ditambah:\n${lines.join('\n')}`);
    } else {
      await ctx.reply(`⚠️ Nggak ada format akun yang valid.`);
    }
    addingAccountState = false; // Reset state
    setTimeout(() => showMenu(ctx), 1000);
  }
});

// Escape string buat HTML tele
function escapeHTML(text) {
  return text.replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;");
}

bot.action('check_account', async (ctx) => {
  addingAccountState = false;
  if (fs.existsSync(ACCOUNTS_FILE)) {
    const accs = fs.readFileSync(ACCOUNTS_FILE, 'utf8').trim();
    if (accs) {
      await ctx.reply(`📋 List Akun Tersedia:\n\n${accs}`);
    } else {
      await ctx.reply('⚠️ File akun kosong.');
    }
  } else {
    await ctx.reply('⚠️ File accounts.txt nggak ketemu.');
  }
  await ctx.answerCbQuery();
});

bot.action('add_account', async (ctx) => {
  addingAccountState = true;
  await ctx.reply('Kirim email akun yang mau ditambah (1 email per chat):');
  await ctx.answerCbQuery();
});

bot.action('delete_account', async (ctx) => {
  addingAccountState = false;
  fs.writeFileSync(ACCOUNTS_FILE, '');
  await ctx.reply('🗑 Semua data akun berhasil dihapus bersih.');
  await ctx.answerCbQuery();
});

bot.action('back_menu', async (ctx) => {
  await ctx.deleteMessage().catch(()=>{});
  await showMenu(ctx);
  await ctx.answerCbQuery();
});

bot.action('select_accounts', async (ctx) => {
  addingAccountState = false;
  if (fs.existsSync(ACCOUNTS_FILE)) {
    currentAccountsList = fs.readFileSync(ACCOUNTS_FILE, 'utf8').split('\n').map(l=>l.trim()).filter(l=>l.length>3);
    if (currentAccountsList.length > 0) {
      selectedEmails.clear();
      await renderSelectionMenu(ctx);
    } else {
      await ctx.reply('⚠️ File akun kosong. Tambah akun dulu.');
    }
  } else {
    await ctx.reply('⚠️ File accounts.txt nggak ketemu.');
  }
  await ctx.answerCbQuery();
});

bot.action(/^toggle_(\d+)$/, async (ctx) => {
  const idx = parseInt(ctx.match[1]);
  if (!isNaN(idx) && currentAccountsList[idx]) {
    const email = currentAccountsList[idx];
    if (selectedEmails.has(email)) {
      selectedEmails.delete(email);
    } else {
      selectedEmails.add(email);
    }
    await renderSelectionMenu(ctx);
  }
  await ctx.answerCbQuery();
});

bot.action(['run_bot_all', 'run_bot_selected'], async (ctx) => {
  addingAccountState = false;
  if (isRunning) {
    return ctx.answerCbQuery('⏳ Sabar, bot login masih jalan...', { show_alert: true });
  }
  
  if (ctx.callbackQuery.data === 'run_bot_selected') {
    if (selectedEmails.size === 0) {
      return ctx.answerCbQuery('⚠️ Belum ada akun yang dipilih!', { show_alert: true });
    }
    fs.writeFileSync(TARGET_ACCOUNTS_FILE, Array.from(selectedEmails).join('\n') + '\n', 'utf8');
    await ctx.deleteMessage().catch(()=>{});
  } else {
    if (fs.existsSync(TARGET_ACCOUNTS_FILE)) fs.unlinkSync(TARGET_ACCOUNTS_FILE);
  }
  
  isRunning = true;
  await ctx.answerCbQuery();
  
  let progressMessageId = null;
  let logBuffer = [];
  let updateTimeout = null;
  
  // Fungsi buat update pesan ke tele biar ga spam
  const updateProgress = () => {
    if (!progressMessageId) return;
    const text = logBuffer.join('\n');
    if (text) {
      const escapedText = escapeHTML(text);
      ctx.telegram.editMessageText(
        ctx.chat.id, 
        progressMessageId, 
        null,
        `<pre>${escapedText}</pre>`, 
        { parse_mode: 'HTML' }
      ).catch(err => { /* abaikan error kalau teksnya sama persis */ });
    }
  };

  const initialMsg = await ctx.reply('🚀 Menyiapkan bot login...');
  progressMessageId = initialMsg.message_id;

  // Jalanin bot.js pake child_process
  const botProcess = spawn('node', ['bot.js'], { cwd: __dirname });

  botProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (let line of lines) {
      line = line.replace('\r', '').trim();
      if (!line) continue;
      
      // Filter URL panjang callback biar rapih
      if (line.includes('URL akhir di tab Google:') && line.includes('callback')) {
        continue; 
      }

      // Simpan 15 baris log terakhir aja biar pesan telegram ga kepanjangan
      logBuffer.push(line);
      if (logBuffer.length > 15) {
        logBuffer.shift();
      }
    }
    
    // Throttle update telegram tiap 1.5 detik
    if (!updateTimeout) {
      updateTimeout = setTimeout(() => {
        updateProgress();
        updateTimeout = null;
      }, 1500);
    }
  });

  botProcess.stderr.on('data', (data) => {
    logBuffer.push(`[ERROR] ${data.toString().trim()}`);
    if (logBuffer.length > 15) logBuffer.shift();
  });

  botProcess.on('close', (code) => {
    isRunning = false;
    if (updateTimeout) clearTimeout(updateTimeout);
    updateProgress();
    ctx.reply(`✅ Proses login kelar (Exit code: ${code}).`);
  });
});

const asciiArt = `
    _    ____     __  __     ____  ____  __  __ 
   / \\  / ___|    \\ \\/ /    / ___|| __ )|  \\/  |
  / _ \\| |  _ _____|  |_____\\___ \\|  _ \\| |\\/| |
 / ___ \\ |_| |_____/  \\_____|___) | |_) | |  | |
/_/   \\_\\____|    /_/\\_\\    |____/|____/|_|  |_|
  --- Developer Jenius Pemalas (SBMod) ---
`;

console.log(asciiArt);
console.log('Bot Telegram jalan, cuy. Pantau HP lu.');

bot.launch().then(() => {
  console.log('🤖 Telegram bot (Telegraf) jalan. Chat bot lu sekarang.');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
