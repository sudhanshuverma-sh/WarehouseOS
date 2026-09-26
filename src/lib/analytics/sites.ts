/**
 * Sites as the analytics dashboards see them: which sites a service is
 * offered at, which segment each is in, and which site an entry belongs to
 * whatever code it was filed under (site code, WH code or an alias).
 */

import type { Segment } from './period';

export interface AnalyticsSite {
  id: string;
  name: string;
  city: string;
  channel: 'B2B' | 'B2C' | 'BOTH';
  aliases: string[];
  services: 'ALL' | string[];
}

export const segmentOf = (s: Pick<AnalyticsSite, 'channel'>): 'B2B' | 'B2C' => (s.channel === 'B2C' ? 'B2C' : 'B2B');

export const inSegment = (s: Pick<AnalyticsSite, 'channel'>, seg: Segment) => seg === 'ALL' || segmentOf(s) === seg;

/** The sites a service is offered at, in the segment and chosen sites. */
export function sitesInScope(sites: readonly AnalyticsSite[], service: string, segment: Segment, picked: readonly string[]): AnalyticsSite[] {
  const wanted = new Set(picked);
  return sites.filter(
    (s) => (s.services === 'ALL' || s.services.includes(service)) && inSegment(s, segment) && (!wanted.size || wanted.has(s.id)),
  );
}

/** Find the site an entry was filed under, by any code the site goes by. */
export function siteResolver(sites: readonly AnalyticsSite[]): (code: string) => AnalyticsSite | undefined {
  const map = new Map<string, AnalyticsSite>();
  for (const s of sites) for (const a of [s.id, ...s.aliases]) map.set(String(a).toLowerCase(), s);
  return (code) => map.get(String(code ?? '').toLowerCase());
}
