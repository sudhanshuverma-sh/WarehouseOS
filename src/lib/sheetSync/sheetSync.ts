/**
 * Helpers for linking a service to its Google Sheet.
 *
 * NOTE ON SCOPE — the app already has the plumbing:
 *   AppContext.sheetWebhookUrls   where each service's /exec URL is kept
 *   AppContext.setSheetWebhookUrl how it is changed
 *   AppContext.submitViaHiddenForm how a payload is posted
 *
 * That mechanism is used by the daily site report and already by parts of
 * diesel, so this file deliberately does NOT add storage or a second way
 * to post. Two sync systems that can disagree is worse than one, in the
 * same way two filtering systems were. What lives here is the part that
 * was missing: validating the URL somebody pastes, and describing the
 * payload shape the scripts expect.
 *
 * WHY A HIDDEN FORM AND NOT fetch()
 *   Apps Script Web Apps send no CORS headers, so a fetch() to /exec is
 *   blocked by the browser before the script runs — and it fails as an
 *   opaque network error, which looks like the script is broken when it is
 *   not. A form POST targeting a popup is exempt. The cost is that the
 *   response cannot be read back, so a push is fire-and-forget: the local
 *   write decides success and the sheet is a mirror that may lag.
 */

export interface SheetPayload {
  action: string;
  /** The column the script upserts on: Unique ID, Record_ID, and so on. */
  key: string;
  tab?: string;
  header: string[];
  values: (string | number)[];
}

/**
 * Checks that a URL is a deployed Web App rather than the editor link.
 *
 * script.google.com/home/projects/.../edit is the editor;
 * script.google.com/macros/s/.../exec is the deployment. Pasting the
 * editor URL is the most common setup mistake and produces a silent
 * no-op — the popup opens, shows a Google page, and nothing is ever
 * written. Worth catching here rather than leaving someone to wonder.
 */
export function validateSheetUrl(url: string): { ok: boolean; message?: string } {
  const u = url.trim();
  if (!u) return { ok: false, message: 'Paste the /exec URL from your Apps Script deployment.' };

  if (!/^https:\/\/script\.google\.com\//.test(u)) {
    return { ok: false, message: 'That is not an Apps Script URL — it should start with https://script.google.com/' };
  }
  if (u.includes('/edit')) {
    return {
      ok: false,
      message: 'That is the editor link. Use Deploy → Manage deployments and copy the Web app URL, which ends in /exec.',
    };
  }
  if (!u.endsWith('/exec')) {
    return {
      ok: false,
      message: u.endsWith('/dev')
        ? 'That is the /dev test URL, which only works while you are signed in as the author. Use the /exec URL.'
        : 'The deployment URL should end in /exec.',
    };
  }
  return { ok: true };
}

/** Opens the /exec URL so an admin can read doGet()'s health report. */
export function openSheetHealthCheck(url: string): void {
  window.open(url, '_blank', 'noopener');
}
