# Form-Markexhaust

A party and product order form with an admin-only Excel export. The app can run locally with Express or on Netlify with Functions and Netlify Blobs.

## Run locally

Install Node.js 18 or newer, then open PowerShell in this folder:

```powershell
npx.cmd --yes yarn@1.22.22 install
npm.cmd start
```

Keep the private `parties.json` and `products.json` files in the project folder. Set `PARTY_ADMIN_PASSWORD` before starting, or enter a password of at least 12 characters when prompted. Open the order form at `http://127.0.0.1:8787/` or the admin panel at `http://127.0.0.1:8787/admin`.

The party JSON must contain `party code`, `party name`, `party add1`, `party add 2`, `city`, `state`, `pin`, `state 1`, `status`, `md/td`, and `zone` fields. The product JSON must contain `part number`, `product code`, `product name`, `mrp`, `standard pack`, `md price`, and `td price`. Product quantities must be positive multiples of the product's standard pack.

Local orders are saved in the Git-ignored `submissions.json`. The master-data files and submissions are private local files; back them up and do not commit them.

## Deploy a working Netlify site

Netlify runs the API as serverless Functions, so the local Express server and local JSON file storage are not used in production. Netlify Blobs stores the master data, admin sessions, and orders persistently. Only the HTML files are published as static assets; the private JSON files and `.env.local` are not copied into the deploy.

1. Log in to Netlify CLI and link this folder to the Netlify site:

   ```powershell
   npx.cmd --yes netlify-cli@latest login
   npx.cmd --yes netlify-cli@latest link
   ```

   If you do not have a Netlify site yet, use `npx.cmd --yes netlify-cli@latest init` to create and link one.

2. In Netlify site environment variables, set `PARTY_ADMIN_PASSWORD` to a unique password of at least 12 characters. Never put it in source control or paste it into chat.
3. Build and deploy the app:

   ```powershell
   npx.cmd --yes netlify-cli@latest deploy --build --prod
   ```

4. Import the private master data from this computer to the deployed site. Set `PARTY_ADMIN_PASSWORD` in the current PowerShell session to the same value configured in Netlify, then run:

   ```powershell
   $env:NETLIFY_SITE_URL = "https://your-site-name.netlify.app"
   node scripts/import-netlify-master-data.js
   ```

   The importer sends the local JSON files over HTTPS through the authenticated admin API. It reports only the record counts, not the data.

5. Test the live order form, submit a test order, and confirm it appears in the admin panel before sharing the URL.

Run backend tests with `npm.cmd test`; run the static build locally with `npm.cmd run build`.
