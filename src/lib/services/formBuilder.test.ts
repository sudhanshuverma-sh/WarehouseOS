import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '../../types';
import {
  FORM_TEMPLATES,
  blankField,
  cleanForSave,
  fieldKeyFrom,
  problemCount,
  serviceCodeFrom,
  validateDraft,
  withType,
} from './formBuilder';
import { validateSubmissionData } from './validateSubmission';

const q = (over: Partial<FieldDefinition>): FieldDefinition => ({ key: 'reading', label: 'Reading', type: 'number', required: false, ...over });

describe('naming', () => {
  it('turns a question into a saved name that is unique', () => {
    expect(fieldKeyFrom('Chiller Temp (°C)', [])).toBe('chillerTempC');
    expect(fieldKeyFrom('', [])).toBe('field');
    expect(fieldKeyFrom('', ['field', 'field2'])).toBe('field3');
    expect(fieldKeyFrom('24h reading', [])).toBe('field24hReading');
  });

  it('turns a form name into a service code', () => {
    expect(serviceCodeFrom('Cold Room / Chiller log')).toBe('COLD_ROOM_CHILLER_LOG');
    expect(serviceCodeFrom('5S audit')).toBe('S_5S_AUDIT');
    expect(serviceCodeFrom('  ')).toBe('');
  });
});

describe('answer types', () => {
  it('keeps only the settings that apply when the type changes', () => {
    const number = q({ unit: 'L', min: 0, max: 10, defaultValue: 5 });
    expect(withType(number, 'select')).toEqual({ key: 'reading', label: 'Reading', type: 'select', required: false, options: ['Option 1', 'Option 2'] });
    expect(withType(q({ type: 'text' }), 'percentage').unit).toBe('%');
    expect(blankField('temperature', ['field'])).toEqual({ key: 'field2', label: '', type: 'temperature', required: false, unit: '°C' });
  });
});

describe('validateDraft', () => {
  const draft = { name: 'UPS check', code: 'UPS_CHECK', fields: [q({})] };

  it('passes a complete draft', () => {
    expect(problemCount(validateDraft(draft, ['DIESEL'], 'create'))).toBe(0);
  });

  it('names what is missing or wrong', () => {
    const p = validateDraft(
      {
        name: ' ',
        code: 'ups check',
        fields: [
          q({ label: '' }),
          q({ key: 'b', type: 'select', options: [' ', ''] }),
          q({ key: 'c', type: 'select', options: ['A', 'A'] }),
          q({ key: 'd', min: 10, max: 2 }),
          q({ key: 'd' }),
        ],
      },
      [],
      'create',
    );
    expect(p.name).toBe('Give the form a name.');
    expect(p.code).toMatch(/capital letters/);
    expect(p.fields).toEqual({
      0: 'Write the question.',
      1: 'Add at least one option.',
      2: 'Each option must be different.',
      3: 'The minimum is larger than the maximum.',
      4: 'Two questions share the same saved name.',
    });
  });

  it('refuses a code already in use when creating, and ignores codes when editing', () => {
    expect(validateDraft({ ...draft, code: 'DIESEL' }, ['diesel'], 'create').code).toBe('DIESEL is already used by another service.');
    expect(validateDraft({ ...draft, code: '' }, [], 'edit').code).toBeUndefined();
    expect(validateDraft({ ...draft, fields: [] }, [], 'edit').form).toBe('Add at least one question.');
  });
});

describe('cleanForSave', () => {
  it('trims and drops settings that do not apply', () => {
    expect(
      cleanForSave([
        { key: 'a', label: ' Condition ', type: 'select', required: true, options: [' Good ', '', 'Good', 'Bad'], unit: 'x', helperText: ' ' },
        { key: 'b', label: 'Litres', type: 'number', required: false, unit: ' L ', min: '' as unknown as number, max: 500 },
        { key: 'c', label: 'Photo', type: 'evidence', required: false, defaultValue: 'x' },
      ]),
    ).toEqual([
      { key: 'a', label: 'Condition', type: 'select', required: true, options: ['Good', 'Bad'] },
      { key: 'b', label: 'Litres', type: 'number', required: false, unit: 'L', max: 500 },
      { key: 'c', label: 'Photo', type: 'evidence', required: false },
    ]);
  });
});

describe('templates', () => {
  it('are publishable as they are', () => {
    for (const t of FORM_TEMPLATES) {
      expect(problemCount(validateDraft({ name: t.name, code: 'X', fields: t.fields }, [], 'create'))).toBe(0);
    }
  });

  it('accept the answers a POC would give', () => {
    const [equipment] = FORM_TEMPLATES;
    const answers = { working: 'Yes', reading: '412.5', condition: 'Good', remarks: 'Fine' };
    expect(validateSubmissionData(equipment.fields.filter((f) => f.type !== 'evidence'), answers)).toEqual([]);
  });
});
