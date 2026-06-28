const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

(async () => {
  console.log('Baca list akun...');
  let accounts = [];
  try {
    if (fs.existsSync('target_accounts.txt')) {
      const data = fs.readFileSync('target_accounts.txt', 'utf8');
      accounts = data.split('\n').map(line => line.trim()).filter(line => line.length > 3);
      console.log('Baca list target akun (mode terpilih)...');
    } else {
      const data = fs.readFileSync('accounts.txt', 'utf8');
      accounts = data.split('\n').map(line => line.trim()).filter(line => line.length > 3);
    }
  } catch (e) {
    console.log('File accounts.txt gak ketemu atau kosong.');
    return;
  }

  console.log(`Ada ${accounts.length} akun. Buka browser...`);

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    channel: 'chrome',
    args: [
      '--start-maximized',
      '--disable-features=ChromeSignin,DiceWebSigninIntercept',
      '--disable-sync',
      '--no-first-run',
      '--no-default-browser-check',
      '--incognito'
    ]
  });

  // Cari context yang beneran Incognito (karena --incognito bikin 2 context, default-nya tetep biasa)
  const context = browser.browserContexts().find(c => c.isIncognito) || browser.defaultBrowserContext();
  const page = (await context.pages())[0] || await context.newPage();

  // -- LOGIN DASHBOARD DULU --
  console.log('Login ke dashboard utama (localhost:20128/login)...');
  await page.goto('http://localhost:20128/login', { waitUntil: 'networkidle2' });

  try {
    await page.waitForSelector('input[type="password"]', { timeout: 5000 });
    // Kasih delay ngetik dan jeda sebelum ngeklik
    await page.type('input[type="password"]', '123456', { delay: 100 });
    await new Promise(r => setTimeout(r, 2000));

    // Hajar pakai tombol Enter aja
    await page.keyboard.press('Enter');
    
    // Tunggu sampai link Providers beneran muncul di layar (artinya login sukses)
    console.log('Nunggu masuk ke dashboard utama...');
    await page.waitForSelector("::-p-xpath(//a[contains(@href, '/dashboard/providers')])", { timeout: 15000 });
    
    // Jeda dikit biar render sempurna
    await new Promise(r => setTimeout(r, 1500));
    console.log('Sukses masuk dashboard utama.');
  } catch (err) {
    console.log('Form login awal nggak ketemu atau udah login sebelumnya, lanjut aja...');
  }
  // -- SELESAI LOGIN DASHBOARD --

  // -- NAVIGASI MANUAL VIA UI --
  console.log('Navigasi ke menu Providers...');
  const providerLinks = await page.$$("::-p-xpath(//a[contains(@href, '/dashboard/providers')])");
  if (providerLinks.length > 0) {
    await providerLinks[0].click();
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('Klik kartu Antigravity...');
  const antigravityCards = await page.$$("::-p-xpath(//h3[contains(text(), 'Antigravity')])");
  if (antigravityCards.length > 0) {
    await antigravityCards[0].click();
    await new Promise(r => setTimeout(r, 2000));
  } else {
    // Fallback kalau kartunya nggak nemu
    await page.goto('http://localhost:20128/dashboard/providers/antigravity', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
  }

  for (let i = 0; i < accounts.length; i++) {
    const email = accounts[i];
    const password = 'masuk123'; // Hardcode password karena semuanya sama
    console.log(`\n[${i + 1}/${accounts.length}] Proses login: ${email}`);
    
    // Nggak usah page.goto lagi, posisinya udah di halaman Antigravity

    try {
      // 0. Bersihin cookie Google sebelum klik Add (biar popup nanti kebuka dalam kondisi bersih tanpa perlu reload)
      const client = await page.target().createCDPSession();
      const { cookies } = await client.send('Network.getAllCookies');
      const googleCookies = cookies.filter(c => c.domain.includes('google.com'));
      for (const cookie of googleCookies) {
        await client.send('Network.deleteCookies', { name: cookie.name, domain: cookie.domain });
      }

      // 1. Klik tombol "Add"
      console.log(`  -> [1/5] Nyari tombol 'Add' di dashboard...`);

      // Tunggu maksimal 15 detik sampai tombol Add beneran muncul di layar (karena ini React, kadang telat render)
      try {
        await page.waitForSelector("::-p-xpath(//button[contains(., 'Add')])", { timeout: 15000 });
      } catch (e) {
        console.log(`  -> [!] Tombol Add nggak muncul setelah 15 detik.`);
      }

      const addBtns = await page.$$("::-p-xpath(//button[contains(., 'Add')])");
      if (addBtns.length > 0) {
        await addBtns[0].click();
        console.log(`  -> [1/5] Tombol 'Add' diklik. Tunggu 2 detik...`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        console.log(`  -> [!] Gagal nemu tombol Add.`);
      }

      // 2. Klik "I Understand, Continue" kalau muncul
      console.log(`  -> [2/5] Ngecek tombol peringatan merah...`);
      const understandBtns = await page.$$("::-p-xpath(//button[contains(., 'I Understand, Continue')])");
      if (understandBtns.length > 0) {
        await understandBtns[0].click();
        console.log(`  -> [2/5] Tombol peringatan diklik. Tunggu 2 detik...`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        console.log(`  -> [2/5] Tombol peringatan nggak muncul, aman.`);
      }

      // 3. Nangkep Popup Asli bawaan web (nggak usah copas URL dan bikin tab manual)
      console.log(`  -> [3/5] Nunggu popup Google asli kebuka...`);
      let popup = null;
      for (let attempt = 0; attempt < 15; attempt++) {
        const pages = await context.pages();
        // Cari page yang URL-nya ngarah ke google
        popup = pages.find(p => p.url().includes('accounts.google.com'));
        if (popup) break;
        await new Promise(r => setTimeout(r, 1000));
      }

      if (!popup) {
        console.log(`  -> [!] Gagal nangkep popup Google buat ${email}. Lanjut akun lain.`);
        continue;
      }
      
      console.log(`  -> [3/5] Dapet popup Google aslinya!`);
      
      // Kasih jeda bentar biar script anti-bot Google kelar loading
      await new Promise(r => setTimeout(r, 2000));

      // Injeksi Virtual Mouse merah biar keliatan geraknya dan nempel terus di popup
      await popup.evaluateOnNewDocument(() => {
        document.addEventListener('DOMContentLoaded', () => {
          if (document.querySelector('.puppeteer-mouse-pointer')) return;
          const box = document.createElement('div');
          box.classList.add('puppeteer-mouse-pointer');
          const style = document.createElement('style');
          style.appendChild(document.createTextNode(`
            .puppeteer-mouse-pointer {
              pointer-events: none; position: absolute; top: 0; z-index: 10000; left: 0;
              width: 20px; height: 20px; background: rgba(255,0,0,0.5);
              border: 2px solid white; border-radius: 50%; margin: -10px 0 0 -10px;
              padding: 0; transition: background .2s, transform .2s;
            }
            .puppeteer-mouse-pointer.clicked { background: rgba(255,0,0,1); transform: scale(0.8); }
          `));
          document.head.appendChild(style);
          document.body.appendChild(box);
          document.addEventListener('mousemove', e => {
            box.style.left = e.pageX + 'px';
            box.style.top = e.pageY + 'px';
          }, true);
          document.addEventListener('mousedown', () => box.classList.add('clicked'), true);
          document.addEventListener('mouseup', () => box.classList.remove('clicked'), true);
        });
      });

      // Jalanin sekali buat halaman yang udah kepalang load
      await popup.evaluate(() => {
        if (document.querySelector('.puppeteer-mouse-pointer')) return;
        const box = document.createElement('div');
        box.classList.add('puppeteer-mouse-pointer');
        const style = document.createElement('style');
        style.appendChild(document.createTextNode(`
          .puppeteer-mouse-pointer {
            pointer-events: none; position: absolute; top: 0; z-index: 10000; left: 0;
            width: 20px; height: 20px; background: rgba(255,0,0,0.5);
            border: 2px solid white; border-radius: 50%; margin: -10px 0 0 -10px;
            padding: 0; transition: background .2s, transform .2s;
          }
          .puppeteer-mouse-pointer.clicked { background: rgba(255,0,0,1); transform: scale(0.8); }
        `));
        document.head.appendChild(style);
        document.body.appendChild(box);
        document.addEventListener('mousemove', e => {
          box.style.left = e.pageX + 'px';
          box.style.top = e.pageY + 'px';
        }, true);
        document.addEventListener('mousedown', () => box.classList.add('clicked'), true);
        document.addEventListener('mouseup', () => box.classList.remove('clicked'), true);
      });

      // 4. Proses Login Google (Di Tab Baru)
      console.log(`  -> [4/5] Ngisi form Email Google...`);
      await popup.waitForSelector('input[name="identifier"]', { visible: true });
      await new Promise(r => setTimeout(r, 1500)); // Jeda ekstra biar natural
      await popup.type('input[name="identifier"]', email, { delay: 150 }); // Ngetik lebih pelan
      await new Promise(r => setTimeout(r, 1000));
      
      const nextBtnEmail = await popup.$$("::-p-xpath(//button[contains(., 'Next') or contains(., 'Selanjutnya') or contains(., 'Berikutnya')])");
      if (nextBtnEmail.length > 0) {
        await nextBtnEmail[0].click();
      } else {
        await popup.keyboard.press('Enter'); // Fallback
      }
      
      console.log(`  -> [4/5] Email di-submit. Tunggu loading animasi Google...`);
      await new Promise(r => setTimeout(r, 3000));

      console.log(`  -> [4/5] Ngisi form Password...`);
      await popup.waitForSelector('input[name="Passwd"]', { visible: true, timeout: 15000 });
      await popup.type('input[name="Passwd"]', password, { delay: 100 }); // perlambat dikit
      await new Promise(r => setTimeout(r, 1000));
      
      // Scroll mentok bawah dulu
      await popup.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 500));

      // Cari koordinat tombol Next dan klik pake virtual mouse
      const pwdBtnCoords = await popup.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('span, button'));
        for (const el of spans) {
          const text = (el.innerText || el.textContent || '').trim();
          if (text.match(/^(Next|Selanjutnya|Berikutnya)$/i)) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.top >= 0) {
              return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            }
          }
        }
        return null;
      });

      if (pwdBtnCoords) {
        await popup.mouse.move(pwdBtnCoords.x, pwdBtnCoords.y, { steps: 10 });
        await new Promise(r => setTimeout(r, 200));
        await popup.mouse.click(pwdBtnCoords.x, pwdBtnCoords.y);
      } else {
        await popup.keyboard.press('Enter'); // Fallback
      }
      
      console.log(`  -> [4/5] Password di-submit. Nunggu halaman diproses...`);

      // 5. Tunggu redirect balik atau tombol persetujuan
      console.log(`  -> [5/5] Cek halaman persetujuan Google (Continue / Allow / I understand / Login)...`);
      
      let callbackFound = false;
      // Looping ngecek tiap 2 detik selama maksimal 30 detik
      for (let attempt = 0; attempt < 15; attempt++) {
        const currentUrl = popup.url();
        // Cek beneran nyampe localhost, jangan cuma ngecek kata 'callback' (karena di URL google juga ada redirect_uri=callback)
        if (currentUrl.startsWith('http://localhost') && currentUrl.includes('callback')) {
          callbackFound = true;
          break;
        }

        try {
          // Scroll mentok bawah dulu biar elemen yang hidden/lazy-load pada nongol
          await popup.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await new Promise(r => setTimeout(r, 500));

          // Cari koordinat tombol persetujuan
          const btnCoords = await popup.evaluate(() => {
            const spans = Array.from(document.querySelectorAll('span, button'));
            for (const el of spans) {
              const text = (el.innerText || el.textContent || '').trim();
              const isMatch = text.match(/^(Continue|Allow|Lanjutkan|I understand|Saya mengerti|Login|Use Chrome|No thanks|Lain kali|Not now|Next|Berikutnya)$/i);
              const rect = el.getBoundingClientRect();
              if (isMatch && rect.width > 0 && rect.height > 0 && rect.top >= 0 && !el.disabled) {
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
              }
            }
            return null;
          });
          
          if (btnCoords) {
            console.log(`  -> [5/5] Nemu tombol persetujuan/Next. Scroll & Klik via Virtual Mouse...`);
            await popup.mouse.move(btnCoords.x, btnCoords.y, { steps: 10 });
            await new Promise(r => setTimeout(r, 200));
            await popup.mouse.click(btnCoords.x, btnCoords.y);
            await new Promise(r => setTimeout(r, 3000));
          }
        } catch(e) {}

        await new Promise(r => setTimeout(r, 2000));
      }
      
      const finalUrl = popup.url();
      console.log(`  -> URL akhir di tab Google: ${finalUrl}`);
      
      // await popup.close(); // JANGAN DITUTUP DULU BIAR BISA DILIHAT MASALAHNYA

      if (finalUrl.startsWith('http://localhost') && finalUrl.includes('callback')) {
        console.log('  -> Paste URL ke form dashboard tab pertama...');
        // Cari input yang placeholder-nya localhost:20128/callback
        const callbackInputs = await page.$$("::-p-xpath(//input[contains(@placeholder, 'callback')])");
        if (callbackInputs.length > 0) {
          // Paste instan pakai JS biar cepet, nggak ngetik satu-satu
          await page.evaluate((el, val) => {
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, callbackInputs[0], finalUrl);
          
          await new Promise(r => setTimeout(r, 500));
          await page.keyboard.press('Enter');
          console.log(`  -> URL Callback di-submit!`);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          console.log(`  -> [!] Nggak nemu form buat paste URL callback.`);
        }
      }

      console.log(`[v] Sukses tambah akun: ${email}`);
      
      // Simpan akun yang sukses ke berhasil.txt sama timestamp
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      fs.appendFileSync('berhasil.txt', `[${timestamp}] ${email}\n`, 'utf8');
      
      // Hapus email dari array
      accounts.splice(i, 1);
      i--; // Mundurin index karena array nyusut
      
      // Update accounts.txt
      if (fs.existsSync('accounts.txt')) {
         let allAccs = fs.readFileSync('accounts.txt', 'utf8').split('\n').map(x => x.trim()).filter(x => x.length > 3);
         allAccs = allAccs.filter(a => a !== email);
         fs.writeFileSync('accounts.txt', allAccs.join('\n') + (allAccs.length > 0 ? '\n' : ''), 'utf8');
      }
      
      // Update target_accounts.txt kalau lagi mode terpilih
      if (fs.existsSync('target_accounts.txt')) {
         fs.writeFileSync('target_accounts.txt', accounts.join('\n') + (accounts.length > 0 ? '\n' : ''), 'utf8');
      }
      
      const randomDelaySuccess = Math.floor(Math.random() * (30000 - 10000 + 1)) + 10000;
      console.log(`  -> Jeda ${Math.round(randomDelaySuccess/1000)} detik sebelum lanjut akun selanjutnya biar natural...`);
      await new Promise(r => setTimeout(r, randomDelaySuccess));
    } catch (e) {
      console.log(`  -> [X] Gagal pas proses akun ${email}:`, e);
      const randomDelayFail = Math.floor(Math.random() * (30000 - 10000 + 1)) + 10000;
      console.log(`  -> Jeda ${Math.round(randomDelayFail/1000)} detik sebelum lanjut akun selanjutnya...`);
      await new Promise(r => setTimeout(r, randomDelayFail));
    }
  }

  console.log('\nSEMUA AKUN UDAH BERES DIPROSES.');
  // browser.close(); // Biarin kebuka aja
})();
