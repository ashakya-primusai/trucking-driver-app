This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

1. Import the `driver-app` directory as the Vercel project root (or set **Root Directory** to `driver-app` in a monorepo).
2. Add **Environment Variables** (same names as `.env.example`). Copy values from your local `.env.local` or from Firebase Console → Project settings → Your apps → Web app.
3. Enable them for **Production** and **Preview**.
4. **Redeploy** after adding or changing variables — `NEXT_PUBLIC_*` values are embedded at build time.

Required Firebase variables:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_DATABASE_URL` (e.g. `https://<project-id>-default-rtdb.firebaseio.com`)

Optional API (defaults to `https://trucking.primustechnologiesai.com`):

- `NEXT_PUBLIC_API_BASE_URL` or `NEXT_PUBLIC_API_URL`

### Live chat / notifications (Firebase Admin on API server)

The driver app client uses hardcoded Firebase web config (`lib/firebase.ts`). **Custom auth tokens** come from your API at `/driver-app/auth/firebase-token`.

On the **API server** (not Vercel), set:

- `FIREBASE_DATABASE_URL=https://trucking-sds-default-rtdb.firebaseio.com`
- `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the full service account JSON one line, **or**
- `FIREBASE_SERVICE_ACCOUNT_PATH=./config/firebase-service-account.json` (if the file exists on the server)

Restart the API after adding env vars. Drivers must **log out and log in again** to pick up live chat.

Without this, loads/chat still work over HTTP; only realtime push (instant Bella replies, notification badges) is disabled.

# Trucking-Driver-App
# trucking-driver-app
