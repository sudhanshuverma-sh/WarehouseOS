/**
 * WarehouseOS API + static front-end, in one service.
 *
 * One deployment rather than two: the built React app and the API are
 * served from the same origin, so there is no CORS configuration, no
 * cross-domain cookie problem, and one place where identity is resolved.
 * That shape is what apps.blinkit.in supports — a project with an app and
 * a Postgres beside it.
 *
 *   npm run api:dev     against a local Postgres
 *   npm run api         production (serves dist/)
 */

import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Db } from './db';
import { createIdentityResolver } from './identity';
import { createRoutes } from './routes';
import { assertHeaderMap } from './ebdgColumns';
import { ensureSuperAdmins, parseEmailList } from './bootstrap';

const PORT = Number(process.env.PORT) || 8080;
const isProduction = process.env.NODE_ENV === 'production';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Exiting at boot beats limping along and failing on the first request:
    // a container that will not start is visible in the deploy, whereas one
    // that starts and 500s looks like an application bug.
    console.error(`Missing ${name}. The platform injects DATABASE_URL when you add Postgres to the project.`);
    process.exit(1);
  }
  return value;
}

/**
 * Managed Postgres almost always requires TLS; a local install almost
 * never offers it. Decide from the host so neither case needs a flag —
 * and getting this wrong fails at connect time with a message ("server
 * does not support SSL") that reads like the database is broken.
 * DB_SSL still overrides, for the deployment that defies the pattern.
 */
function useSsl(connectionString: string): boolean {
  if (process.env.DB_SSL === 'true') return true;
  if (process.env.DB_SSL === 'false') return false;
  return !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);
}

async function main() {
  const connectionString = required('DATABASE_URL');
  const db = new Db({
    connectionString,
    max: Number(process.env.DB_POOL_MAX) || 10,
    ssl: useSsl(connectionString),
  });

  const identity = createIdentityResolver({
    mode: process.env.AUTH_MODE,
    headerName: process.env.AUTH_HEADER_NAME,
    devEmail: process.env.DEV_ACTOR_EMAIL,
    jwtClaim: process.env.AUTH_JWT_CLAIM,
    isProduction,
    // jwtVerify is wired in when the platform confirms it issues tokens;
    // createIdentityResolver refuses AUTH_MODE=jwt without one rather than
    // silently accepting unverified tokens.
  });

  // Refuse to serve if the database disagrees with EBDG_COLUMN_ORDER.
  // Drift would land numbers in the wrong fields, which reads as a
  // calculation bug and is very slow to trace back to a schema change.
  try {
    await db.unscoped((c) => assertHeaderMap(c));
    console.log('[boot] EB-DG schema matches the app: 109 columns, in order');
  } catch (err) {
    console.error('[boot]', (err as Error).message);
    process.exit(1);
  }

  // A fresh database has no Super Admin, and only a Super Admin can import
  // master data — so without this nobody could get in. Does nothing once
  // any live Super Admin exists.
  const { emails: superAdmins, invalid } = parseEmailList(process.env.SUPER_ADMIN_EMAILS);
  if (invalid.length) console.warn(`[boot] ignoring SUPER_ADMIN_EMAILS entries that are not addresses: ${invalid.join(', ')}`);
  const granted = await db.unscoped((c) => ensureSuperAdmins(c, superAdmins));
  if (granted.length) {
    console.log(`[boot] no Super Admin existed; granted ${granted.length} from SUPER_ADMIN_EMAILS`);
  } else if (superAdmins.length === 0) {
    console.warn('[boot] SUPER_ADMIN_EMAILS is empty. On a fresh database nobody will be able to import master data.');
  }

  const app = express();
  app.disable('x-powered-by');
  // Photos are sent raw to /api/attachments, never as JSON, so this limit is
  // only for form data and the master-data import (~400 rows).
  app.use(express.json({ limit: '5mb' }));

  app.use('/api', createRoutes({ db, identity }));

  // The built front-end, when there is one. In development Vite serves it
  // on its own port and proxies /api here, so dist/ is absent and that is
  // not an error.
  const dist = join(process.cwd(), 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    // Client-side routing: anything not under /api falls through to the
    // SPA shell so a deep link reloads correctly instead of 404ing.
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
  }

  const server = app.listen(PORT, () => {
    console.log(`[boot] listening on ${PORT} (auth: ${identity.mode}${isProduction ? '' : ', development'})`);
  });

  // Finish in-flight requests before exiting, so a deploy does not drop a
  // POC's submission mid-write.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      console.log(`[shutdown] ${signal}`);
      server.close(async () => {
        await db.close();
        process.exit(0);
      });
    });
  }
}

main().catch((err) => {
  console.error('[boot] failed:', err);
  process.exit(1);
});
