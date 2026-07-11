# Trading Journal — versiunea de share

Jurnal de tranzacționare cu statistici automate + calendar economic agregat (ForexFactory, Investing.com, Myfxbook).

Aceasta este copia pregătită pentru publicare online (Vercel + GitHub). Versiunea ta de lucru locală rămâne în folderul `trading-journal`.

**Pașii de publicare sunt în [DEPLOY.md](DEPLOY.md).**

## Diferențe față de versiunea locală

- `vercel.json` — face ca feed-ul live ForexFactory (`/api/ffcal`) să meargă și pe site-ul publicat, nu doar cu `npm run dev`
- `.github/workflows/update-news.yml` — regenerează `public/news.json` automat la fiecare oră și declanșează redeploy, ca prietenii tăi să vadă mereu știri proaspete
- `.gitignore` — exclude `node_modules` și `dist` din repo
- `public/news.json` — pornește gol; se umple la primul `npm run news` sau la prima rulare a workflow-ului

## Important de știut

- Trade-urile se salvează în `localStorage`, adică în browserul fiecăruia. Fiecare persoană care deschide site-ul își vede doar propriul jurnal — știrile sunt comune, trade-urile nu.
- Sursa Myfxbook folosește `curl` ca să treacă de Cloudflare. Pe serverele GitHub (Linux) e posibil să fie totuși blocată — scriptul continuă atunci cu ForexFactory + Investing, deci calendarul rămâne complet pentru știrile importante.

## Rulare locală (identic cu originalul)

```
npm install
npm run news   # generează public/news.json
npm run dev    # http://localhost:5173
```
