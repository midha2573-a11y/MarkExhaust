# Form-Markexhaust

A party and product order form with an admin-only Excel export.

## Run locally with Node.js

Install Node.js 18 or newer, then open PowerShell in this folder.

1. Put the private `parties.json` and `products.json` master-data files in this folder.
2. Start the Node.js server:

   ```powershell
   npm.cmd start
   ```

3. Enter an admin password with at least 12 characters when prompted. The password is masked while typing.
4. Open the party form at `http://127.0.0.1:8787/` or the admin panel at `http://127.0.0.1:8787/admin`.

The party JSON must contain `party code`, `party name`, `party add1`, `party add 2`, `city`, `state`, `pin`, `state 1`, `status`, `md/td`, and `zone` fields. The form only lists parties in the East, West, North, and South zones. Parties with `LOCK` status cannot search or submit products; `UNCLOCK` status enables ordering. The product JSON must contain `part number`, `product code`, `product name`, `mrp`, `standard pack`, `md price`, and `td price` fields. Product quantities must be positive multiples of that product's standard pack.

By default, local submissions are saved to `submissions.json`. If `MONGODB_URI` is set, local submissions and admin sessions use MongoDB instead. On Vercel, submissions and admin sessions are stored in MongoDB; the required `parties` and `products` collections are read from the same database. Keep private business data and credentials out of Git. The admin Excel download uses a browser-hosted XLSX library and requires an internet connection.

`PARTY_ADMIN_PASSWORD` can be set in the process environment instead of entering it at startup. `MONGODB_URI` enables MongoDB storage, and `MONGODB_DB` optionally selects the database (default: `markexhaust`). The MongoDB database user needs read/write access to that database. Never commit the URI or share its password. The Node server listens on `127.0.0.1` by default; `HOST` and `PORT` can override the address.

Run the backend tests with `npm.cmd test`.

This project now uses the Node.js backend; the former PowerShell server has been removed.

## Deploy on Vercel

The Vercel API function reads master data from MongoDB and stores orders in the `submissions` collection. Admin sessions are stored in `admin_sessions` with an expiry index. Before deploying:

1. In MongoDB Atlas, create a database user with read/write access to the `markexhaust` database. Configure Atlas Network Access to allow connections from your deployment.
2. Import the private party and product records into `markexhaust.parties` and `markexhaust.products`. Each collection should contain one document per row from the corresponding JSON array, with the existing field names unchanged. Do not commit these private files.
3. In the Vercel project settings, add `MONGODB_URI` using the connection string from Atlas (replace `<db_password>` with the real password; URL-encode special characters), `MONGODB_DB` set to `markexhaust`, and `PARTY_ADMIN_PASSWORD` set to a unique password of at least 12 characters. Add them for the production environment (and preview too, if needed).
4. Deploy the project from its linked GitHub repository. The `/admin` route is rewritten to the admin page; order and admin APIs run as a Vercel function.

Do not paste the real connection string or database password into chat or source files. A deployment without the environment variables and both master-data collections will return a service-unavailable error rather than accepting orders.
