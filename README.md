# Farm Manager

A phone-friendly farm database: expenses by category, medicine inventory,
vaccination records, and milk production tracking. Data is stored locally in
the browser (localStorage). Each device keeps its own records.

## Run locally
```
npm install
npm run dev
```

## Deploy to Vercel
1. Push this folder to a GitHub repo.
2. In Vercel: Add New > Project > import the repo.
3. Framework preset: Vite. Build command `npm run build`, output `dist`.
4. Deploy.

## Notes
- Storage is per-device/per-browser. Clearing browser data erases records.
- Use the export (download) button in each tab to back up to CSV.
- To install on a phone: open the deployed link, then "Add to Home Screen".
