import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import {
  createIdentityResolver,
  HeaderIdentityResolver,
  JwtIdentityResolver,
  DevIdentityResolver,
  NoIdentityError,
  normaliseEmail,
} from './identity';

/** A Request stub with just the header lookup the resolvers use. */
const req = (headers: Record<string, string>): Request =>
  ({ header: (n: string) => headers[n.toLowerCase()] }) as unknown as Request;

describe('normaliseEmail', () => {
  it('lower-cases and trims', () => {
    expect(normaliseEmail('  Sudhanshu.Verma@Grofers.com ')).toBe('sudhanshu.verma@grofers.com');
  });

  it('leaves dots and plus-tags alone', () => {
    // Google treats these as one mailbox, but poc_master is a list of
    // literal strings. Rewriting an address to match a different row would
    // grant access nobody assigned.
    expect(normaliseEmail('paidi.kiran@zomato.com')).toBe('paidi.kiran@zomato.com');
    expect(normaliseEmail('a+b@zomato.com')).toBe('a+b@zomato.com');
  });
});

describe('header identity', () => {
  const r = new HeaderIdentityResolver('x-auth-request-email');

  it('reads the configured header', async () => {
    await expect(r.resolve(req({ 'x-auth-request-email': 'Gyan.Jaiswal@zomato.com' }))).resolves.toEqual({
      email: 'gyan.jaiswal@zomato.com',
    });
  });

  it('refuses when the header is absent', async () => {
    await expect(r.resolve(req({}))).rejects.toBeInstanceOf(NoIdentityError);
  });

  it('refuses a header that is not an address', async () => {
    await expect(r.resolve(req({ 'x-auth-request-email': 'admin' }))).rejects.toBeInstanceOf(NoIdentityError);
  });

  it('honours a different header name', async () => {
    const custom = new HeaderIdentityResolver('x-goog-authenticated-user-email');
    await expect(custom.resolve(req({ 'x-goog-authenticated-user-email': 'a@zomato.com' }))).resolves.toEqual({
      email: 'a@zomato.com',
    });
  });
});

describe('jwt identity', () => {
  it('reads the email claim from a verified token', async () => {
    const r = new JwtIdentityResolver(async () => ({ email: 'Anshu.Maji@zomato.com' }));
    await expect(r.resolve(req({ authorization: 'Bearer abc' }))).resolves.toEqual({
      email: 'anshu.maji@zomato.com',
    });
  });

  it('refuses a token the verifier rejects', async () => {
    const r = new JwtIdentityResolver(async () => {
      throw new Error('signature mismatch');
    });
    await expect(r.resolve(req({ authorization: 'Bearer abc' }))).rejects.toBeInstanceOf(NoIdentityError);
  });

  it('refuses a verified token with no email claim', async () => {
    const r = new JwtIdentityResolver(async () => ({ sub: '12345' }));
    await expect(r.resolve(req({ authorization: 'Bearer abc' }))).rejects.toBeInstanceOf(NoIdentityError);
  });

  it('refuses when there is no Bearer prefix', async () => {
    const r = new JwtIdentityResolver(async () => ({ email: 'a@zomato.com' }));
    await expect(r.resolve(req({ authorization: 'abc' }))).rejects.toBeInstanceOf(NoIdentityError);
  });

  it('never calls the verifier for a missing header', async () => {
    let called = false;
    const r = new JwtIdentityResolver(async () => {
      called = true;
      return { email: 'a@zomato.com' };
    });
    await expect(r.resolve(req({}))).rejects.toBeInstanceOf(NoIdentityError);
    expect(called).toBe(false);
  });
});

describe('createIdentityResolver', () => {
  it('builds each mode', () => {
    expect(createIdentityResolver({ mode: 'header' }).mode).toBe('header');
    expect(createIdentityResolver({ mode: 'jwt', jwtVerify: async () => ({}) }).mode).toBe('jwt');
    expect(createIdentityResolver({ mode: 'dev', devEmail: 'a@zomato.com' }).mode).toBe('dev');
  });

  it('defaults the header name when none is configured', async () => {
    const r = createIdentityResolver({ mode: 'header' });
    await expect(r.resolve(req({ 'x-auth-request-email': 'a@zomato.com' }))).resolves.toEqual({
      email: 'a@zomato.com',
    });
  });

  // The important one. AUTH_MODE=dev in production would make every
  // request the same hard-coded person — if that person is the lone
  // SUPER_ADMIN, every visitor gets all 120 sites and master-data writes.
  it('refuses dev mode in production', () => {
    expect(() => createIdentityResolver({ mode: 'dev', devEmail: 'a@zomato.com', isProduction: true })).toThrow(
      /production/i,
    );
  });

  it('refuses jwt mode with no verifier rather than trusting the token', () => {
    expect(() => createIdentityResolver({ mode: 'jwt' })).toThrow(/verifier/i);
  });

  it('refuses dev mode with no email', () => {
    expect(() => createIdentityResolver({ mode: 'dev' })).toThrow(/DEV_ACTOR_EMAIL/);
  });

  it('refuses an unknown mode instead of falling back to something permissive', () => {
    expect(() => createIdentityResolver({ mode: 'none' })).toThrow(/Unknown AUTH_MODE/);
  });

  it('rejects a malformed DEV_ACTOR_EMAIL at construction', () => {
    expect(() => new DevIdentityResolver('not-an-email')).toThrow();
  });
});
