# Deploying to Vercel

This project is a Next.js app and is ready to deploy to Vercel. The repository contains `vercel.json` which configures builds and increases the timeout for the long-running `pages/api/analyze.js` API route.

Follow these steps to deploy:

1. Prepare repository
   - Commit all changes and push to your Git provider (GitHub, GitLab, Bitbucket).

2. Add environment variables in Vercel (required)
   - In the Vercel dashboard, add the following Environment Variables (Production / Preview / Development as needed):
     - `OPENAI_API_KEY` (if using OpenAI)
     - `USE_GEMINI` (optional)
     - `GOOGLE_API_KEY` (if using Gemini)
     - `GEMINI_MODEL` (optional)
     - `PAYPAL_CLIENT_ID`
     - `PAYPAL_CLIENT_SECRET`
     - `PAYPAL_ENV` (set to `sandbox` or `live`)
     - `COUPON_CODE` (optional)

   Important: do not commit any secrets into the repo. Use the Vercel UI or the CLI to set env vars.

3. Import project into Vercel
   - In Vercel, click "New Project" → "Import Git Repository" → select this repo.
   - Framework Preset: Vercel should detect Next.js automatically.
   - Root Directory: set if your Next.js app is not at repository root.
   - Finish import.

4. (Optional) Deploy using the Vercel CLI
   - Install CLI:
     ```bash
     npm i -g vercel
     ```
   - Login and link the project:
     ```bash
     vercel login
     vercel link
     ```
   - Add environment variables via CLI (example):
     ```bash
     vercel env add PAYPAL_CLIENT_ID production
     vercel env add PAYPAL_CLIENT_SECRET production
     vercel env add OPENAI_API_KEY production
     ```
   - Deploy (preview):
     ```bash
     vercel
     ```
   - Deploy to production:
     ```bash
     vercel --prod
     ```

5. Notes and troubleshooting
   - Long-running `analyze` operation: `vercel.json` sets `maxDuration: 300` for `pages/api/analyze.js` so the serverless function can run longer. If you still hit timeouts, consider moving heavy work to a background job or using a dedicated server.
   - PayPal: ensure `PAYPAL_ENV` matches the credentials (sandbox vs live). Sandbox accounts sometimes don't support all currencies — this project sends USD to PayPal and shows localized amounts client-side.
   - Coupon: configure `COUPON_CODE` in env to enable coupon bypass.
   - Secrets: keep sensitive keys in Vercel env settings, not in the repo.

6. After deployment
   - Visit your Vercel-provided URL and test the flows: coupon apply, PayPal redirect (sandbox), and analysis route.

If you'd like, I can prepare GitHub Actions or add a `vercel` npm script to automate deployments from CI.
