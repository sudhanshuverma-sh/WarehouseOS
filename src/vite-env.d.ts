/// <reference types="vite/client" />

/**
 * Typed env vars. Vite exposes only VITE_-prefixed variables to the client —
 * that prefix is the boundary between "safe to ship in the bundle" and "must
 * never leave the server", so never prefix a secret with it (see .env.example).
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ALLOWED_HOSTED_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
