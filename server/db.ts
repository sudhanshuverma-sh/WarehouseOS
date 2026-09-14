/**
 * The connection pool, and the one way to talk to it.
 *
 * Every query runs inside withActor(), which opens a transaction and states
 * who the caller is before anything else happens:
 *
 *     begin;
 *     select set_config('app.actor_email', $1, true);
 *     ...
 *     commit;
 *
 * The `true` makes the setting transaction-scoped. Without it the value
 * would outlive the transaction and stay on the pooled connection, so the
 * next request — a different person — would inherit the previous user's
 * identity and see their sites. That is the single most dangerous mistake
 * available in this file, which is why there is no exported `query()` that
 * would let a caller skip it.
 *
 * If the setting is somehow missing, fn_actor_email() returns 'app', which
 * matches no poc_master row, so RLS shows nothing. It fails closed.
 */

import pg from 'pg';

/**
 * numeric arrives from pg as a string, because an arbitrary-precision
 * numeric does not always fit a float64. Every numeric in ebdg_daily is a
 * meter reading or a rupee amount well inside that range, and the app's
 * calculate() works in numbers, so parse them on the way out. Without this
 * the form would receive "1185" and string-concatenate where it meant to
 * subtract.
 */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));

/** date as a plain YYYY-MM-DD string, never a Date. A Date would be
 *  constructed in the server's timezone and can shift a day either way;
 *  the carry-forward chain matches on exact dates, so a shift silently
 *  breaks it. */
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

/** The restricted role every request runs as. Created by db/schema.sql. */
export const APP_ROLE = 'wos_app';

export interface DbConfig {
  connectionString: string;
  max?: number;
  ssl?: boolean;
}

export type Queryable = Pick<pg.PoolClient, 'query'>;

export class Db {
  private readonly pool: pg.Pool;

  constructor(config: DbConfig) {
    this.pool = new pg.Pool({
      connectionString: config.connectionString,
      // The platform's Postgres is small; a pool per container that is
      // larger than the server's max_connections just moves the failure
      // from "slow" to "cannot connect at all".
      max: config.max ?? 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    });

    // An idle client erroring (the database restarted, a proxy dropped it)
    // reaches the pool, not any request. Unhandled, it takes the process
    // down — pg documents this explicitly.
    this.pool.on('error', (err) => {
      console.error('[db] idle client error:', err.message);
    });
  }

  /**
   * Runs `fn` in a transaction that has already declared the actor.
   * Commits on success, rolls back on any throw.
   */
  async withActor<T>(actorEmail: string, fn: (client: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      // Drop to the restricted role for this transaction. DATABASE_URL
      // connects as the user that ran the migrations, which OWNS the
      // tables — and Postgres does not apply RLS to a table's owner. Without
      // this line every policy in db/*.sql is decoration and every POC sees
      // every site. `local` ends it with the transaction, like the setting
      // below.
      await client.query(`set local role ${APP_ROLE}`);
      await client.query('select set_config($1, $2, true)', ['app.actor_email', actorEmail]);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err) {
      // Rollback can itself fail if the connection died mid-transaction.
      // Swallow that one so the original error — the useful one — is what
      // propagates, rather than being masked by the cleanup failure.
      try {
        await client.query('rollback');
      } catch {
        /* connection is gone; releasing it below discards it */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * For startup checks only — schema assertions that run before any user
   * exists and must not be filtered by RLS.
   */
  async unscoped<T>(fn: (client: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async healthy(): Promise<boolean> {
    try {
      await this.pool.query('select 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
