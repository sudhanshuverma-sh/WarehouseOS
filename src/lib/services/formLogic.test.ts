import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '../../types';
import { cleanForSave, copyField, dropRefs, renameRefs, validateDraft, withType } from './formBuilder';
import { cleanLogic, commentKey, followUpErrors, issuesOf, photoKey, pruneEntry, shownFields } from './formLogic';
import { validateSubmissionData } from './validateSubmission';
import { columnsFor } from '../records/recordTable';

/**
 * Forms that do more than one box per question: sections, questions asked
 * only after a certain answer, and answers that open a follow-up and count
 * as an issue. The POC's screen, the API and Records all read these rules.
 */

const FORM: FieldDefinition[] = [
  { key: 'pumpRoom', label: 'Pump room', type: 'section', required: false },
  {
    key: 'alarmOk',
    label: 'Fire alarm OK?',
    type: 'boolean',
    required: true,
    followUp: { when: ['No'], comment: 'required', photo: 'optional', issue: true, prompt: 'What is wrong?' },
  },
  { key: 'sprinkler', label: 'Sprinkler available?', type: 'boolean', required: true },
  {
    key: 'sprinklerCharged',
    label: 'Sprinkler line charged?',
    type: 'boolean',
    required: true,
    showIf: { field: 'sprinkler', equals: ['Yes'] },
    followUp: { when: ['No'], comment: 'required', photo: 'required', issue: true },
  },
  {
    key: 'panel',
    label: 'Panel',
    type: 'select',
    required: true,
    options: ['Good', 'Worn', 'Broken'],
    followUp: { when: ['Worn'], comment: 'optional', photo: 'off', issue: false },
  },
];

describe('show-if', () => {
  it('asks a question only after the answer it hangs on', () => {
    expect(shownFields(FORM, { sprinkler: 'Yes' }).map((f) => f.key)).toContain('sprinklerCharged');
    expect(shownFields(FORM, { sprinkler: 'No' }).map((f) => f.key)).not.toContain('sprinklerCharged');
  });

  it('does not require a question that was not asked', () => {
    const data = { alarmOk: 'Yes', sprinkler: 'No', panel: 'Good' };
    expect(validateSubmissionData(FORM, data)).toEqual([]);
  });

  it('hides a whole branch when its parent is hidden', () => {
    const chain: FieldDefinition[] = [
      { key: 'a', label: 'A', type: 'boolean', required: true },
      { key: 'b', label: 'B', type: 'boolean', required: true, showIf: { field: 'a', equals: ['Yes'] } },
      { key: 'c', label: 'C', type: 'text', required: true, showIf: { field: 'b', equals: ['Yes'] } },
    ];
    // b was answered Yes earlier, then a changed to No: c is no longer asked either.
    expect(shownFields(chain, { a: 'No', b: 'Yes' }).map((f) => f.key)).toEqual(['a']);
  });
});

describe('follow-ups', () => {
  it('require the comment and photo the answer opens', () => {
    const data = { alarmOk: 'No', sprinkler: 'Yes', sprinklerCharged: 'No', panel: 'Good' };
    expect(followUpErrors(FORM, data)).toEqual([
      { field: commentKey('alarmOk'), message: 'Fire alarm OK?: What is wrong?' },
      { field: commentKey('sprinklerCharged'), message: 'Sprinkler line charged?: say why.' },
      { field: photoKey('sprinklerCharged'), message: 'Sprinkler line charged?: attach a photo.' },
    ]);
    expect(validateSubmissionData(FORM, { ...data, alarmOk__comment: 'Panel dead', sprinklerCharged__comment: 'Valve shut', sprinklerCharged__photo: 'p' })).toEqual([]);
  });

  it('ask nothing for an answer that does not open one, or for an optional comment', () => {
    expect(followUpErrors(FORM, { alarmOk: 'Yes', sprinkler: 'No', panel: 'Worn' })).toEqual([]);
  });
});

describe('pruneEntry — the entry as saved', () => {
  it('drops answers to unasked questions and follow-ups the answer did not open, and works out the status', () => {
    const saved = pruneEntry(FORM, {
      alarmOk: 'No',
      alarmOk__comment: 'Panel dead',
      alarmOk__photo: 'photo-1',
      sprinkler: 'No',
      sprinklerCharged: 'No', // answered before sprinkler was changed to No
      sprinklerCharged__comment: 'stale',
      panel: 'Good',
      panel__comment: 'stale',
      overall_status: 'OK', // a client cannot set its own status
      pumpRoom: 'x',
    });
    expect(saved).toEqual({
      alarmOk: 'No',
      alarmOk__comment: 'Panel dead',
      alarmOk__photo: 'photo-1',
      sprinkler: 'No',
      panel: 'Good',
      overall_status: 'CRITICAL',
      issues: 'Fire alarm OK?',
    });
  });

  it('is OK with no issue answer, and adds no status to a form without issue rules', () => {
    expect(pruneEntry(FORM, { alarmOk: 'Yes', sprinkler: 'No', panel: 'Worn' })).toMatchObject({ overall_status: 'OK', issues: '' });
    expect(pruneEntry(FORM, { alarmOk: 'No' }, { status: false })).not.toHaveProperty('overall_status');
    const plain: FieldDefinition[] = [{ key: 'x', label: 'X', type: 'text', required: false }];
    expect(pruneEntry(plain, { x: 'hi' })).toEqual({ x: 'hi' });
  });

  it('reads true/false as Yes/No', () => {
    expect(issuesOf(FORM, { alarmOk: false })).toEqual(['Fire alarm OK?']);
  });
});

describe('cleanLogic — what may be saved', () => {
  it('keeps a show-if only on an earlier fixed-answer question, and only its answers', () => {
    const earlier = FORM.slice(0, 3);
    expect(cleanLogic({ ...FORM[3] }, earlier).showIf).toEqual({ field: 'sprinkler', equals: ['Yes'] });
    expect(cleanLogic({ ...FORM[3], showIf: { field: 'sprinkler', equals: ['Maybe'] } }, earlier).showIf).toBeUndefined();
    expect(cleanLogic({ ...FORM[3], showIf: { field: 'panel', equals: ['Good'] } }, earlier).showIf).toBeUndefined(); // later
  });

  it('keeps a follow-up only on Yes/No or dropdown answers it offers', () => {
    const text: FieldDefinition = { key: 't', label: 'T', type: 'text', required: false, followUp: FORM[1].followUp };
    expect(cleanLogic(text, []).followUp).toBeUndefined();
    const odd = { ...FORM[4], followUp: { ...FORM[4].followUp!, when: ['Missing'] } };
    expect(cleanLogic(odd, []).followUp).toBeUndefined();
  });
});

describe('the builder', () => {
  it('saves show-if and follow-ups, and no required or answer on a section', () => {
    const saved = cleanForSave([{ ...FORM[0], required: true, defaultValue: 'x' } as FieldDefinition, ...FORM.slice(1)]);
    expect(saved[0]).toEqual({ key: 'pumpRoom', label: 'Pump room', type: 'section', required: false });
    expect(saved[1].followUp).toEqual(FORM[1].followUp);
    expect(saved[3].showIf).toEqual({ field: 'sprinkler', equals: ['Yes'] });
  });

  it('flags a show-if on a later question, and a follow-up with no answer picked', () => {
    const moved = [FORM[3], FORM[2]];
    expect(validateDraft({ name: 'F', code: 'F', fields: moved }, [], 'create').fields[0]).toMatch(/earlier/);
    const empty = [{ ...FORM[1], followUp: { ...FORM[1].followUp!, when: [] } }];
    expect(validateDraft({ name: 'F', code: 'F', fields: empty }, [], 'create').fields[0]).toMatch(/follow-up/);
    expect(validateDraft({ name: 'F', code: 'F', fields: FORM }, [], 'create').fields).toEqual({});
  });

  it('drops a follow-up when the question changes type, and keeps show-if links on rename or delete', () => {
    expect(withType(FORM[1], 'text').followUp).toBeUndefined();
    expect(renameRefs(FORM, 'sprinkler', 'hasSprinkler')[3].showIf?.field).toBe('hasSprinkler');
    expect(dropRefs(FORM, 'sprinkler')[3].showIf).toBeUndefined();
    const copy = copyField(FORM[3]);
    copy.showIf!.equals.push('No');
    expect(FORM[3].showIf!.equals).toEqual(['Yes']);
  });
});

describe('Records', () => {
  it('puts the status first, a follow-up comment and photo after their question, and no section column', () => {
    const cols = columnsFor([{ date: '2026-09-25', warehouseId: 'S1', alarmOk: 'No', alarmOk__comment: 'Panel dead', overall_status: 'CRITICAL' }], FORM);
    expect(cols.map((c) => c.label)).toEqual([
      'Date',
      'Site',
      'Overall status',
      'Issues',
      'Fire alarm OK?',
      'Fire alarm OK? — comment',
      'Fire alarm OK? — photo',
      'Sprinkler available?',
      'Sprinkler line charged?',
      'Sprinkler line charged? — comment',
      'Sprinkler line charged? — photo',
      'Panel',
      'Panel — comment',
    ]);
  });
});
