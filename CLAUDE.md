# CLAUDE.md — SnapID

Tento soubor je pro AI asistenty (Claude, Cursor, atd.) pracující na SnapID. Načte se automaticky při každém otevření projektu. Pokud editujete kód SnapID, **přečtěte si nejprve celý tento soubor**.

---

## Kdo jsem (kontext)

- **Lukáš** — solo founder
- Skills: design/grafika, marketing (ne hluboký inženýr)
- Komunikace: česky, přímo, bez vaty
- Plán: Claude Pro

---

## Co je SnapID

AI-powered web appka pro identifikaci objektů z fotky. User nahraje foto → backend pošle obrázek do Claude Sonnet 4.6 → vrátí název, kategorii, hodnotu, původ, vzácnost, popis. PWA, instalovatelná na iPhone/Android.

**Business model:** Freemium — 3 skeny zdarma (localStorage), pak $2.99/měs přes Gumroad. Pro přístup odemyká access kód v localStorage.

---

## Stack a kde co je

| Vrstva | Tech | URL | GitHub |
|--------|------|-----|--------|
| Frontend | Vanilla HTML/CSS/JS, PWA | https://snap-id-five.vercel.app | https://github.com/15LK/SnapID |
| Backend | Node.js + Express | https://snapid-backend-production-0846.up.railway.app | https://github.com/15LK/snapid-backend |
| AI | claude-sonnet-4-6 přes Anthropic API | — | — |
| Platby | Gumroad (aktivní), Stripe (čeká na review do 8.6.2026), Paddle (zamítnut) | https://snapidapp.gumroad.com/l/uzpmiz | — |
| Monitoring | UptimeRobot (každých 5 min) | — | — |
| Hosting frontend | Vercel | — | — |
| Hosting backend | Railway | — | — |

### Klíčové soubory

**Frontend repo (15LK/SnapID):**
- `index.html` — celá appka v jednom souboru
- `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png` — PWA
- `terms/index.html`, `privacy/index.html`, `refund/index.html` — právní stránky
- Font: Space Grotesk

**Backend repo (15LK/snapid-backend):**
- `server.js` — Express server
- Endpointy: `GET /` → status; `POST /identify` → přijímá `{ image: base64, mediaType }`
- Env var: `ANTHROPIC_API_KEY` (uložen v Railway)

### Barevná paleta

- Pozadí tmavé: `#080812`
- Modrá: `#5282FF`, `#8B85FF`
- Zelená (hodnota): `#00D68F`
- Oranžová (vzácnost): `#FFB830`

---

## === BEZPEČNOSTNÍ PRAVIDLA — VŽDY DODRŽOVAT ===

### Univerzální pravidla
Vždy se mě explicitně zeptej a počkej na "ano" PŘED:

1. **Platbami a náklady** — placené API i s free tier, upgrade plánu, nákup domény/hostingu/kreditů. Předem řekni: "💰 Toto může stát X. Pokračovat?"
2. **Odesíláním dat ven** — emaily, sociální sítě, upload na veřejný web, GitHub push, publikování čehokoli (i jako draft). "⚠️ Toto pošle data ven (kam, co). Pokračovat?"
3. **Destruktivními akcemi** — mazání souborů, přepis důležitých souborů (.env, klíče, commits), rm -rf, git push --force, drop database. "🗑️ Toto smaže (co). Potvrdit?"
4. **Manipulací s tajemstvími** — API klíče, tokeny, hesla, OAuth. Pokud uvidím tajemství v chatu → "🔐 Vidím tajemství v chatu, doporučuji ho rotovat a uložit do .env."
5. **Autonomními rozhodnutími** — když nečekaná situace nebo nejsem si 100% jistý → zastavit a zeptat se, ne odhadovat.

### Pravidla specifická pro SnapID

#### NIKDY bez explicitního "ano" Lukáše
- Push na `main` v `15LK/SnapID` nebo `15LK/snapid-backend` (Vercel/Railway auto-deployují → každý push = deploy do produkce)
- Změna `ANTHROPIC_API_KEY` v Railway env vars
- Smazání nebo přejmenování `index.html`, `server.js`, `manifest.json`
- Změna obsahu `terms/`, `privacy/`, `refund/` stránek (právní implikace)
- Úprava cen na Gumroadu, vypnutí produktu
- Změna access kódů (`SNAPID-PRO-2025`, `SNAPIDPRO`, `SNAP-UNLIMITED`) — odemčí stávající platící zákazníky
- Cokoli co volá Anthropic API víckrát než 1× v jedné session (cost control při testování)
- Odesílání emailů zákazníkům, posty na Reddit/TikTok/sociální sítě
- Cokoli spojeného se Stripe odvoláním (čeká do 8.6.2026)

#### Před každým kódovým commitem zkontroluj
1. **Žádné tajemství v kódu** — `ANTHROPIC_API_KEY`, hesla, tokeny → musí být v env vars, ne v kódu
2. **`.gitignore` obsahuje** — `.env`, `.env.local`, `node_modules/`, `.DS_Store`
3. **Funkční localStorage migrace** — pokud měním strukturu localStorage, musí existovat migrace pro stávající Pro uživatele (jinak je smazu z Pro)
4. **PWA nezlobí** — pokud měním `manifest.json` nebo `sw.js`, sdělit jak vyčistit cache
5. **Zpětná kompatibilita access kódů** — všechny tři kódy musí dál fungovat
6. **Ceny / texty na webu** odpovídají Gumroadu a právním stránkám

#### Před spuštěním backendu lokálně nebo deployem
1. Vysvětlit v 3-5 bodech co skript dělá
2. Upozornit na cokoli co volá Anthropic API (= peníze)
3. Počkat na "spusť"

---

## Cost control (Anthropic API)

- **Sonnet 4.6 cena:** ~$3/M input + $15/M output (orientačně)
- **Cena za 1 sken:** odhadem $0.005–$0.02 v input (záleží na velikosti obrázku) + drobnost v output → typicky pod $0.02
- **Risk scénář:** abuse (někdo bypassuje 3-skeny limit přes incognito), bot scraping, viral spike bez Pro paywallu
- **Doporučená opatření** (TODO, ještě nejsou implementovaná):
  - Per-IP rate limit na backendu (např. 20 skenů/hod/IP)
  - Daily cap s emailovým alertem (např. 1000 skenů/den → notifikace)
  - Image size cap před voláním API (např. max 1MB → resize na backendu)
  - Hash-based cache (stejný obrázek nevolá API podruhé)

---

## Známé problémy a gotchas

1. **localStorage se ztrácí** — incognito, jiný prohlížeč, vyčištěná cache → user přijde o Pro a o uložené skeny. **Řeší Supabase** (TODO). Mezitím v Pro emailu zákazníkovi vysvětlit a poslat kód znovu.
2. **Sdílené access kódy** — všichni zákazníci dostávají stejné 3 kódy → kdokoli může sdílet. **Řeší Gumroad webhook + unikátní kódy** (TODO).
3. **Gumroad výplata $100 minimum** — peníze se hromadí dokud nepřekročí prah.
4. **Stripe zablokovaný** — čeká odvolání do 8.6.2026, mezitím Gumroad jako jediná platební cesta.
5. **Railway free tier** — UptimeRobot ping každých 5 min udržuje backend nahoře (jinak by se uspal).

---

## Aktuální TODO (priorita seshora)

1. ⏳ Nahrát `snapid_pro.html` → `index.html` na GitHub + otestovat (kamera, sdílení jako obrázek, vyhledávání)
2. ⏳ TikTok/Reels video — thumbnail s Rolexem připravený, scénář připravený
3. ⏳ Reddit posty — r/whatsthis, r/coins, r/antiques, r/mildlyinteresting
4. ⏳ Supabase — trvalé uložení skenů + email auth
5. ⏳ Gumroad webhook → unikátní kódy per zákazník
6. ⏳ Vlastní doména (snapid.app nebo snapid.co)
7. ⏳ App Store / Google Play (až po 50+ platících)

---

## Když Claude zapomene tato pravidla
Lukáš napíše **"safety check"** → Claude zopakuje pravidla a potvrdí, že je dodržuje.
