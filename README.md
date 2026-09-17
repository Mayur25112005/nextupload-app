# NextUpload — deploy steps

## 1. Files in this folder
- `index.html` — the landing page + tool (static, served by Vercel automatically)
- `api/analyze.js` — serverless backend: fetches YouTube channel data, asks Gemini for ideas
- `package.json` — tells Vercel this is a Node project

## 2. Deploy to Vercel
1. Create a **new GitHub repo**, upload these files (keep the `api/` folder structure exactly as-is).
2. Go to vercel.com → **Add New Project** → Import that repo.
3. Before clicking Deploy, open **Environment Variables** and add:
   - `YOUTUBE_API_KEY` = your Google Cloud YouTube Data API v3 key
   - `GEMINI_API_KEY` = your Google AI Studio key
   - `WEB3FORMS_KEY` = `a3db4b8a-5f8c-4c78-8bf8-1f48df50b4a8` (optional — this is already the default in the code)
4. Click **Deploy**.

If you already have a Vercel project (e.g. tube-boost-landing), you can instead:
- Go to your existing project → **Settings → Environment Variables** → add the two keys above.
- Replace the old `index.html` and add the `api/analyze.js` file, then redeploy (drag & drop or `git push` — whichever you used before).

## 3. Test it live
1. Open your deployed URL.
2. Paste a real YouTube channel link (e.g. `https://youtube.com/@MrBeast`) and click **Analyze — free**.
3. Wait ~10-20 seconds — you should see 1 idea with a title, tags, and reason.
4. Try unlocking a paid pack: click **Unlock**, scan the UPI QR (or pay manually to `yashy7630@okhdfcbank`), enter any UTR number, click confirm.
5. Check your email (`ramashankery24@gmail.com`) — you should get:
   - One email for every free/paid analysis (usage log)
   - One email for every payment claim, with the UTR number — verify manually in your bank/UPI app before trusting it

## 4. Known limitations (be aware of these)
- **Payments are not automatically verified.** Anyone can type a fake UTR and get ideas unlocked. You'll get an email with the UTR every time — check your bank statement before treating it as a real sale. Automatic verification needs a real payment gateway (Razorpay/Cashfree) with webhooks — can be added later.
- **"Free once" is per-browser, not per-person.** It's stored in the browser's local storage — clearing browser data or using another browser resets it. Fine for MVP, not abuse-proof.
- **₹99 "unlimited for a month" isn't tracked over time** — right now it just gives 15 ideas in one sitting. A real month-long unlock needs user accounts (login/email verification), which is a bigger addition — let me know if you want that built next.
- If YouTube or Gemini API keys run out of quota, the analyze button will show an error message instead of crashing.
