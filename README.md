# Form-Markexhaust

A local party and product order form with an admin-only Excel export.

## Run locally

Install Node.js 18 or newer, then open PowerShell in this folder. Install dependencies with Yarn 1 and start the Express server:

```powershell
npx.cmd --yes yarn@1.22.22 install
npm.cmd start
```

Keep the private `parties.json` and `products.json` master-data files in the project folder. The server validates them at startup. Set `PARTY_ADMIN_PASSWORD` in the environment before starting, or enter a password of at least 12 characters when prompted. The password is masked while typing.

Open the order form at `http://127.0.0.1:8787/` or the admin panel at `http://127.0.0.1:8787/admin`. The server listens on `127.0.0.1` by default; `HOST` and `PORT` can override the address.

The party JSON must contain `party code`, `party name`, `party add1`, `party add 2`, `city`, `state`, `pin`, `state 1`, `status`, `md/td`, and `zone` fields. The form only lists parties in the East, West, North, and South zones. Parties with `LOCK` status cannot search or submit products; `UNCLOCK` status enables ordering. The product JSON must contain `part number`, `product code`, `product name`, `mrp`, `standard pack`, `md price`, and `td price` fields. Product quantities must be positive multiples of that product's standard pack.

Submissions are stored locally in `submissions.json`. The master-data files and submissions file are Git-ignored; keep backups of the local files and do not commit private business data. This version has no MongoDB integration and is not suitable for Vercel/serverless deployment, where local file storage is not persistent. The admin Excel download uses a browser-hosted XLSX library and requires an internet connection.

Run the backend tests with `npm.cmd test`.
