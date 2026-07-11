# Cum publici aplicația (o singură dată, ~15 minute)

După acești pași primești un link (ex. `https://trading-journal-xxx.vercel.app`) pe care îl trimiți oricui. Site-ul se actualizează singur — știrile se regenerează la fiecare oră, automat.

## Ce îți trebuie

- Cont GitHub (gratuit) — https://github.com
- Cont Vercel (gratuit) — https://vercel.com (loghează-te cu contul GitHub)
- Git instalat — https://git-scm.com/download/win (dacă nu-l ai deja; verifică cu `git --version`)

## Pasul 1 — Generează știrile inițiale

În folderul `trading-journal-share`, în terminal:

```
npm install
npm run news
```

Așa site-ul are știri din prima, fără să aștepte prima rulare automată.

## Pasul 2 — Urcă proiectul pe GitHub

1. Pe github.com: **New repository** → nume `trading-journal` → **Private** sau Public → Create (fără README, fără .gitignore — le avem deja)
2. În terminal, în folderul `trading-journal-share`:

```
git init
git add .
git commit -m "Trading journal"
git branch -M main
git remote add origin https://github.com/NUMELE-TAU/trading-journal.git
git push -u origin main
```

(Înlocuiește `NUMELE-TAU` cu username-ul tău de GitHub.)

## Pasul 3 — Publică pe Vercel

1. Pe vercel.com: **Add New → Project**
2. Alege repo-ul `trading-journal` → **Import**
3. Vercel detectează singur că e Vite — nu schimba nimic → **Deploy**
4. După ~1 minut primești linkul. Gata — trimite-l prietenului tău.

## Pasul 4 — Verifică actualizarea automată

Pe GitHub: tab-ul **Actions** → workflow-ul „Actualizează știrile" → **Run workflow** (rulare de test). Dacă trece cu verde, de acum rulează singur la fiecare oră: regenerează `news.json`, face commit, iar Vercel republică site-ul automat.

Notă: dacă repo-ul e Private, GitHub oprește automat cron-ul după 60 de zile fără activitate în repo — primești mail și îl repornești cu un click. Pe repo Public nu e cazul.

## Cum se actualizează știrile de acum încolo

- **Automat**: la fiecare oră, prin GitHub Actions (nu faci nimic).
- **Manual** (opțional): rulezi local `npm run news` în acest folder, apoi `git add public/news.json && git commit -m "news" && git push`.

## Dacă vrei să schimbi ceva în aplicație

Modifici fișierele în acest folder, apoi:

```
git add .
git commit -m "descrierea schimbării"
git push
```

Vercel republică automat în ~1 minut.
