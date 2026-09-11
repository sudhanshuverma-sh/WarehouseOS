/**
 * Who is making this request?
 *
 * apps.blinkit.in signs the user in before the request reaches us, but the
 * shape of what it forwards is not yet confirmed. Rather than guess, this
 * module resolves identity behind one interface with three strategies, and
 * AUTH_MODE picks between them. When the platform's answer arrives it is a
 * config change, not a rewrite.
 *
 *   AUTH_MODE=header  a trusted proxy sets AUTH_HEADER_NAME (default
 *                     x-auth-request-email). Only safe when the service
 *                     cannot be reached except through that proxy — see
 *                     the warning below.
 *   AUTH_MODE=jwt     a signed token in Authorization: Bearer. Verified
 *                     against AUTH_JWKS_URL. Safe regardless of ingress.
 *   AUTH_MODE=dev     DEV_ACTOR_EMAIL, for local work with no platform.
 *                     Refuses to start when NODE_ENV=production.
 *
 * ⚠ The header strategy trusts whoever set the header. If anything inside
 * the network can reach this service directly, it can name itself
 * sudhanshu.verma@grofers.com and inherit SUPER_ADMIN — every site's data
 * plus master-data writes. That is only acceptable when direct ingress is
 * blocked and the SSO proxy is genuinely the sole path in. If that cannot
 * be confirmed, use jwt: verifying a signature costs a millisecond and
 * removes the assumption entirely.
 */

import type { Request } from 'express';

export type AuthMode = 'header' | 'jwt' | 'dev';

export interface Identity {
  email: string;
}

/** Thrown when a request carries no usable identity. Becomes a 401. */
export class NoIdentityError extends Error {
  readonly status = 401;
}

export interface IdentityResolver {
  readonly mode: AuthMode;
  resolve(req: Request): Promise<Identity>;
}

/**
 * Normalises an address for comparison against poc_master.
 *
 * Lower-cased because the sheet mixes cases and Postgres string equality
 * does not. Deliberately NOT stripping dots or +tags: at Google those are
 * aliases of one mailbox, but poc_master is a list of literal strings and
 * `p.aidi.kiran@` is simply not a row in it. Silently rewriting an address
 * to match a different row would grant access nobody assigned.
 */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads the address a trusted upstream proxy attached to the request. */
export class HeaderIdentityResolver implements IdentityResolver {
  readonly mode = 'header' as const;

  constructor(private readonly headerName: string) {}

  async resolve(req: Request): Promise<Identity> {
    const raw = req.header(this.headerName);
    if (!raw) {
      throw new NoIdentityError(
        `No ${this.headerName} header. Either the request did not come through the SSO proxy, or the header name is wrong — ask the platform which one it sets.`,
      );
    }
    const email = normaliseEmail(raw);
    if (!EMAIL_SHAPE.test(email)) {
      throw new NoIdentityError(`${this.headerName} is not an email address: ${raw}`);
    }
    return { email };
  }
}

/**
 * Verifies a signed token and reads the email claim.
 *
 * The verify function is injected rather than imported so this stays
 * testable without a live JWKS endpoint, and so swapping the JWT library
 * does not reach into the request path.
 */
export type JwtVerifier = (token: string) => Promise<Record<string, unknown>>;

export class JwtIdentityResolver implements IdentityResolver {
  readonly mode = 'jwt' as const;

  constructor(
    private readonly verify: JwtVerifier,
    private readonly claim = 'email',
  ) {}

  async resolve(req: Request): Promise<Identity> {
    const header = req.header('authorization');
    if (!header?.toLowerCase().startsWith('bearer ')) {
      throw new NoIdentityError('No Bearer token on the request.');
    }

    let claims: Record<string, unknown>;
    try {
      claims = await this.verify(header.slice(7).trim());
    } catch (err) {
      // The reason a token failed (expired, wrong issuer, bad signature) is
      // useful in logs and dangerous in a response — it tells someone
      // probing exactly which part to fix. Keep it one-sided.
      throw new NoIdentityError(`Token rejected: ${(err as Error).message}`);
    }

    const raw = claims[this.claim];
    if (typeof raw !== 'string' || !EMAIL_SHAPE.test(normaliseEmail(raw))) {
      throw new NoIdentityError(`Token has no usable '${this.claim}' claim.`);
    }
    return { email: normaliseEmail(raw) };
  }
}

/** Local development only. Every request is the same person. */
export class DevIdentityResolver implements IdentityResolver {
  readonly mode = 'dev' as const;

  constructor(private readonly email: string) {
    if (!EMAIL_SHAPE.test(normaliseEmail(email))) {
      throw new Error(`DEV_ACTOR_EMAIL is not an email address: ${email}`);
    }
  }

  async resolve(): Promise<Identity> {
    return { email: normaliseEmail(this.email) };
  }
}

export interface IdentityConfig {
  mode?: string;
  headerName?: string;
  devEmail?: string;
  jwtVerify?: JwtVerifier;
  jwtClaim?: string;
  isProduction?: boolean;
}

/**
 * Builds the resolver for this deployment.
 *
 * Fails at startup rather than per-request: a misconfigured auth mode that
 * only surfaces when the first user signs in is a much worse outage than
 * one that stops the container from booting.
 */
export function createIdentityResolver(config: IdentityConfig): IdentityResolver {
  const mode = (config.mode ?? 'dev').toLowerCase();

  switch (mode) {
    case 'header':
      return new HeaderIdentityResolver(config.headerName || 'x-auth-request-email');

    case 'jwt':
      if (!config.jwtVerify) {
        throw new Error('AUTH_MODE=jwt needs a verifier — set AUTH_JWKS_URL.');
      }
      return new JwtIdentityResolver(config.jwtVerify, config.jwtClaim ?? 'email');

    case 'dev':
      if (config.isProduction) {
        throw new Error(
          'AUTH_MODE=dev in production would let every request act as one hard-coded user. Set AUTH_MODE=header or jwt.',
        );
      }
      if (!config.devEmail) {
        throw new Error('AUTH_MODE=dev needs DEV_ACTOR_EMAIL.');
      }
      return new DevIdentityResolver(config.devEmail);

    default:
      throw new Error(`Unknown AUTH_MODE '${config.mode}'. Expected header, jwt or dev.`);
  }
}
