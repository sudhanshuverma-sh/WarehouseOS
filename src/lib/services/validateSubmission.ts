/**
 * Validates a generic service entry against that service's form.
 *
 * Every service that is not Diesel, EB-DG or the Daily Site Report is a
 * list of fields (service_form.fields) and a bag of values. The browser
 * runs this to mark fields as the POC types; the API runs the same
 * function before saving, so a value the form would refuse cannot arrive
 * by another route.
 */

import type { FieldDefinition } from '../../types';
import type { FieldError } from '../masterData/validate';
import { followUpErrors, isShown, keyMap } from './formLogic';

/** Google Drive / Docs share links — the only links accepted as evidence. */
export const DRIVE_LINK = /^https:\/\/(drive|docs)\.google\.com\//;

export const isGoogleDriveLink = (value: unknown): boolean =>
  typeof value === 'string' && DRIVE_LINK.test(value.trim());

/** Largest stored photo. Matches the attachment_shape check in db/services.sql. */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

export const ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const BOOLEAN_VALUES = [true, false, 'true', 'false', 'Yes', 'No'];

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export function validateSubmissionData(
  fields: FieldDefinition[],
  data: Record<string, unknown>,
): FieldError[] {
  const errors: FieldError[] = [];
  const fail = (f: FieldDefinition, message: string) => errors.push({ field: f.key, message });
  const byKey = keyMap(fields);

  for (const f of fields) {
    // A heading has no answer; a question that was not asked has none either.
    if (f.type === 'section' || !isShown(f, data, byKey)) continue;
    const v = data[f.key];

    if (isBlank(v)) {
      if (f.required) fail(f, `${f.label} is required.`);
      continue;
    }

    switch (f.type) {
      case 'number':
      case 'percentage':
      case 'temperature': {
        const n = Number(v);
        if (typeof v === 'boolean' || !Number.isFinite(n)) {
          fail(f, `${f.label} must be a number.`);
          break;
        }
        // A percentage outside 0-100 is a typo, whatever the form forgot to say.
        const min = f.min ?? (f.type === 'percentage' ? 0 : undefined);
        const max = f.max ?? (f.type === 'percentage' ? 100 : undefined);
        if (min !== undefined && n < min) fail(f, `${f.label} must be at least ${min}.`);
        if (max !== undefined && n > max) fail(f, `${f.label} must be at most ${max}.`);
        break;
      }
      case 'boolean':
        if (!BOOLEAN_VALUES.includes(v as never)) fail(f, `${f.label} must be Yes or No.`);
        break;
      case 'select':
        if (f.options?.length && !f.options.includes(String(v))) {
          fail(f, `${f.label} must be one of ${f.options.join(', ')}.`);
        }
        break;
      case 'date':
        if (!ISO_DATE.test(String(v))) fail(f, `${f.label} must be a date (YYYY-MM-DD).`);
        break;
      case 'time':
        if (!HH_MM.test(String(v))) fail(f, `${f.label} must be a 24-hour time like 18:00.`);
        break;
      case 'evidence':
        // An uploaded attachment's id. The photo or link itself was
        // validated when it was uploaded.
        if (!UUID.test(String(v))) fail(f, `${f.label}: attach a link.`);
        break;
      default:
        if (typeof v === 'object') fail(f, `${f.label} must be text.`);
    }
  }

  // An answer that opens a follow-up needs what the follow-up requires.
  errors.push(...followUpErrors(fields, data));
  return errors;
}
