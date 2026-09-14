/// <reference types="vite/client" />

/**
 * The front-end reads no environment variables today: the database URL and
 * identity settings live on the server (server/index.ts). If one is ever
 * added, remember Vite exposes only VITE_-prefixed variables to the browser
 * bundle — that prefix is the line between "safe to ship to every visitor"
 * and "must never leave the server", so never prefix a secret with it.
 */
