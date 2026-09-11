/**
 * Supabase client — the Postgres backend for master data.
 *
 * WHY THE ANON KEY IS SAFE TO SHIP: it is a public identifier, not a
 * password. It grants nothing on its own — every table has Row Level
 * Security on (see db/schema.sql §8), so what a request can actually read
 * or write is decided by the signed-in user's JWT, server-side, inside
 * Postgres. That is MASTERDATA.md §6's "filter server-side, client-side
 * scope is never the control" — which the Google Sheets architecture
 * could not do at all.
 *
 * Never put the SERVICE ROLE key in this file or any VITE_ variable. That
 * one does bypass RLS, and anything prefixed VITE_ is compiled into the
 * bundle and readable by every visitor.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True when both env vars are present. The app still runs without them —
 * it falls back to the Google Sheets / paste-JSON path — so this migration
 * can land without breaking anyone who hasn't set up their .env yet.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

/** Throws a readable error instead of a null-deref when env vars are missing. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured — copy .env.example to .env.local and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.'
    );
  }
  return supabase;
}

/**
 * Starts Google sign-in, restricted to your Workspace domain.
 *
 * The domain restriction is enforced twice on purpose: `hd` here is only a
 * hint to Google's account chooser (a determined user can ignore it), so
 * the real gate is that a signed-in email with no POC_Master row resolves
 * to no access at all — MASTERDATA.md §6: "Domain membership is
 * authentication, not authorisation."
 */
export async function signInWithGoogle(hostedDomain = 'grofers.com') {
  const client = requireSupabase();
  return client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      queryParams: { hd: hostedDomain, prompt: 'select_account' },
      redirectTo: window.location.origin
    }
  });
}

export async function signOut() {
  const client = requireSupabase();
  return client.auth.signOut();
}
