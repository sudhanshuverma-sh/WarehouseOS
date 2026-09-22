/**
 * The noticeboard: messages, SOPs and documents a Super Admin posts, and
 * the record of who has read them.
 *
 * Who may see a notice is decided by RLS (db/noticeboard.sql), not here: a
 * notice addressed to one person does not come back for anyone else, so
 * there is no filter in this file to forget.
 */

import { Router } from 'express';
import { isGoogleDriveLink } from '../../src/lib/services/validateSubmission';
import { handle, HttpError } from '../http';
import { iso, isPlainObject, numericId, optionalText, requiredText, runAs, type RouteDeps } from './common';

type Row = Record<string, any>;

export type NoticeAudience = 'ALL' | 'SITE' | 'PERSON';

/** A database row in the shape the app reads. */
export const toNotice = (r: Row) => ({
  id: String(r.notice_id),
  title: r.title,
  body: r.body ?? undefined,
  linkUrl: r.link_url ?? undefined,
  audience: r.audience as NoticeAudience,
  siteCode: r.site_code ?? undefined,
  personEmail: r.person_email ?? undefined,
  postedBy: r.posted_by,
  postedByName: r.posted_by_name ?? undefined,
  postedAt: iso(r.posted_at),
  read: r.read === true,
});

/** Checks a new notice before the database sees it, so the reason is readable. */
function noticeFrom(body: unknown) {
  if (!isPlainObject(body)) throw new HttpError(400, 'Expected a notice.');

  const title = requiredText(body.title, 'Give the notice a title.');
  if (title.length > 200) throw new HttpError(400, 'Keep the title under 200 characters.');

  const text = optionalText(body.body);
  const link = optionalText(body.linkUrl);
  if (link && !isGoogleDriveLink(link)) {
    throw new HttpError(400, 'Share the document as a Google Drive or Docs link.');
  }

  const audience = body.audience;
  if (audience !== 'ALL' && audience !== 'SITE' && audience !== 'PERSON') {
    throw new HttpError(400, 'Say who this notice is for: everyone, one site, or one person.');
  }
  const siteCode = audience === 'SITE' ? requiredText(body.siteCode, 'Choose the site this notice is for.') : null;
  const personEmail =
    audience === 'PERSON' ? requiredText(body.personEmail, 'Choose the person this notice is for.').toLowerCase() : null;

  return { title, text, link, audience, siteCode, personEmail, postedByName: optionalText(body.postedByName) };
}

export function noticeboardRoutes(deps: RouteDeps): Router {
  const router = Router();
  const run = runAs(deps);

  // What this person may read, newest first, each saying whether they have.
  router.get(
    '/notices',
    handle(async (req, res) => {
      const rows = await run(req, async (c, email) =>
        (
          await c.query(
            `select n.*, (r.notice_id is not null) as read
               from notice n
               left join notice_read r
                 on r.notice_id = n.notice_id and r.reader_email = $1
              order by n.posted_at desc
              limit 500`,
            [email],
          )
        ).rows,
      );
      res.json(rows.map(toNotice));
    }),
  );

  router.post(
    '/notices',
    handle(async (req, res) => {
      const n = noticeFrom(req.body);
      const saved = await run(req, async (c) => {
        // Asked before the insert so the refusal reads as a sentence, not as
        // a policy violation. RLS (post_notice) refuses it regardless.
        const { rows: can } = await c.query('select fn_can_post_notice() as ok');
        if (!can[0]?.ok) {
          throw new HttpError(403, 'Only a Super Admin or a Service Admin can post to the noticeboard.', 'FORBIDDEN');
        }
        const { rows } = await c.query(
          `insert into notice (title, body, link_url, audience, site_code, person_email, posted_by_name)
           values ($1, $2, $3, $4, $5, $6, $7)
           returning *`,
          [n.title, n.text, n.link, n.audience, n.siteCode, n.personEmail, n.postedByName],
        );
        return rows[0];
      });
      // Whoever posts it has, by definition, read it.
      res.status(201).json(toNotice({ ...saved, read: true }));
    }),
  );

  // Opening a notice twice is not an error, so this is an upsert.
  //
  // It inserts from a SELECT on notice rather than from the id as given.
  // That select runs under RLS, so a notice this person cannot see yields no
  // row and nothing is written, and the answer is 204 either way. Inserting
  // the raw id instead let a POC record reading someone else's private
  // notice, and told them it existed: a missing id failed the foreign key
  // (400) while a real private one succeeded (204). The notice_read policy
  // refuses it too; this makes the route unable to even try.
  router.post(
    '/notices/:id/read',
    handle(async (req, res) => {
      const id = numericId(req.params.id, 'Notice');
      await run(req, (c) =>
        c.query(
          `insert into notice_read (notice_id)
           select notice_id from notice where notice_id = $1
           on conflict do nothing`,
          [id],
        ),
      );
      res.status(204).end();
    }),
  );

  return router;
}
