# MAMA

MAMA is an Expo app for iOS and Android. The current starter includes Supabase
email/password sign-in and registration plus a sample personal-finance dashboard.
The dashboard figures and transactions are demo content; no bank accounts or
financial records are connected yet.

## Configure Supabase

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard).
2. Enable Email authentication and choose whether new accounts require email
   confirmation.
3. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` to your project's URL and anon/publishable
   key.
4. Start the app with `npx expo start`.

The anon/publishable key is intended for client apps. Never put a Supabase
service-role key in the app. Before storing financial records, enable
Row-Level Security and add policies that restrict every record to its owner.

For EAS builds, add the same two `EXPO_PUBLIC_` variables to the EAS
environment used by the build. Do not commit `.env` or credentials.

## Checks

```sh
npm run lint
npx tsc --noEmit
npx expo-doctor
```
