# SoftLight Co. POS

Browser-based point-of-sale app built with React, TypeScript, Vite, Firebase
Authentication, Firestore, and Firebase Hosting. It runs on the free Spark plan.

## Run locally

```sh
npm install
npm run dev
```

Without Firebase configuration the app uses browser local storage and a
demonstration Admin/Staff switch. That local mode is not authentication or
access control and must not be used for shared/production shop accounts.

## Connect a Firebase project

1. Create a Firebase project, a Cloud Firestore database, and a Firebase Web
   App.
2. In Firebase Authentication, enable **Email/Password** sign-in. Do not enable
   public account creation; this app intentionally has no sign-up page.
3. Copy `.env.example` to `.env.local` and fill in the Firebase Web App values.
   Restart the Vite server after editing the environment file.
4. Install the Firebase CLI, sign in, and select the project:

   ```sh
   npm install --global firebase-tools
   firebase login
   firebase use --add
   ```

5. In Firebase Authentication, create your owner account. Copy its UID. In
   Firestore, create `users/{ownerUid}` with these fields:

   ```json
   { "role": "owner", "email": "owner@example.com" }
   ```

   Role documents must be created in the Firebase Console (or a trusted Admin
   SDK). Client writes to `users` are denied by the rules.
6. Deploy the Firestore rules and the web app (Firebase Hosting) in one step.
   The project is linked in `.firebaserc` (`softlight-co`).

   ```sh
   npx firebase-tools login
   npm run deploy
   ```

7. Sign in to the app as the owner. On a new Firebase database, the app seeds
   `softlight-pos/main` from the signed-in browser's existing local POS data and
   publishes the checkout-only catalog. Check the product and sales data before
   using the shop.
8. Create each staff login in Firebase Authentication. For every employee, add
   `users/{theirUid}` in Firestore with `role: "staff"` and their email. Staff
   can then sign in using their assigned credentials. Use Firebase's password
   reset email flow when they need a password reset.

Owner and staff both read and write `softlight-pos/main`; staff are trusted
employees. The app shows staff only the checkout page. Checkout runs as a
Firestore transaction that re-reads current stock and prices, records the
cashier, sale, FIFO costs, and inventory movements, and uses the sale ID to
avoid duplicates after a retry. Firestore rules block anyone without a
`users/{uid}` role document. Turn off public sign-up in Firebase
Authentication → Settings → User actions.

The owner role can view and edit the whole app data document. Keep product
images small: Firestore documents have a 1 MiB limit and app data above 900 KiB
is rejected before sync. The single document is designed for this small shop,
not high-volume multi-register concurrency.

Firebase Web App configuration is public client configuration, not a server
secret. Never add a service-account key to this repository or `.env.local`.
Cloud Functions use Firebase's server identity. Review the deployed
`firestore.rules`, enable billing if required for Cloud Functions, and do not
deploy Firestore test-mode rules.

## Reports

Daily Sales includes a selectable calendar-month summary with total sales,
number of sales, units sold, product-by-product revenue and quantity, monthly
restock count/quantity, and current stock. It is calculated from the sale and
inventory-movement records for the selected month. It also shows profit and
restock spending per product, sales per staff account, and can be downloaded
as a CSV file.

The owner's edits are saved with a revision check, so a sale completed by staff
at the same moment is never overwritten; the owner sees a message and can redo
the edit on the latest data.

## Checks

```sh
npm run build
npm run lint
```
