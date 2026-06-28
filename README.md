# 9router-login-AG-X-SBMod

![Terminal Logo](terminal.png)

Bot otomatisasi berbasis Puppeteer dan Telegram untuk nambahin akun Google secara otomatis ke dashboard 9Router. Dikembangkan khusus untuk bypass sistem keamanan Google dengan *human-like behavior* (virtual mouse, natural delays).

## Fitur Utama
- 🤖 **Stealth Mode Puppeteer**: Susah kedetect sama Google reCAPTCHA.
- 🖱️ **Virtual Mouse Injection**: Mensimulasikan pergerakan dan klik mouse secara fisik, lengkap dengan indikator titik merah di layar buat *monitoring*.
- 📱 **Telegram Control**: Remote-control penuh dari Telegram. Bisa cek, nambah, hapus akun, dan milih spesifik akun mana aja yang mau di-login.
- ♻️ **Auto-Clean & Logging**: Akun yang sukses otomatis dihapus dari *list* antrean dan masuk log khusus (`berhasil.txt`) lengkap sama tanggal/jam.
- 🕒 **Natural Delays**: Jeda eksekusi dibikin *random* (10 - 30 detik) biar terlihat natural seperti manusia beneran.

## Persyaratan
- Node.js (v18 atau lebih baru)
- 9Router terinstall dan berjalan di port 20128 (`http://localhost:20128`)

## Instalasi
1. Clone repositori ini.
2. Jalankan \`npm install\` buat menginstal *dependencies* (\`puppeteer\`, \`puppeteer-extra\`, \`puppeteer-extra-plugin-stealth\`, \`telegraf\`, \`dotenv\`).
3. Buat file \`.env\` di *root folder* proyek ini dan isi kredensial bot Telegram:
   \`\`\`env
   TELEGRAM_BOT_TOKEN=token_bot_lu_dari_botfather
   TELEGRAM_ADMIN_ID=id_telegram_lu_buat_akses
   \`\`\`
   *(Tenang, \`.env\` udah masuk \`.gitignore\` jadi aman nggak bakal ke-push)*.

## Cara Pakai
1. Start bot Telegram-nya:
   \`\`\`bash
   node telegram.js
   \`\`\`
2. Buka bot lu di Telegram, ketik \`/menu\` atau \`/start\`.
3. Tambah daftar email lewat tombol *➕ Tambah Akun* (Bisa *paste* banyak email sekaligus per baris).
4. Klik *☑️ Pilih Akun & Login* buat milih akun mana aja yang mau di-eksekusi.
5. Duduk manis, biarin bot yang kerja keras.

*Author: Azrial Galih Prasetyo (Developer Jenius Pemalas)*
*Instagram: @al.sebirumatahari_*
*Telegram: @sbmshop*
