import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '../../types';
import {
  FORM_TEMPLATES,
  blankField,
  builtInFields,
  cleanForSave,
  extraFields,
  columnsToFields,
  fieldKeyFrom,
  guessFieldType,
  parseList,
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

  it('refuses a question the service’s own screen already asks', () => {
    // The whole point: a POC must not be asked for the rate twice.
    const asked = [q({ key: 'ratePerLitre', label: 'Rate per Litres (₹)' })];
    const byKey = validateDraft({ ...draft, fields: [q({ key: 'ratePerLitre', label: 'Rate' })] }, [], 'edit', asked);
    expect(byKey.fields[0]).toMatch(/already asks for “Rate per Litres \(₹\)”/);

    const byLabel = validateDraft({ ...draft, fields: [q({ key: 'rateAgain', label: 'rate per litres (₹) ' })] }, [], 'edit', asked);
    expect(byLabel.fields[0]).toMatch(/already asks/);

    expect(problemCount(validateDraft({ ...draft, fields: [q({ key: 'lockoutTagNo', label: 'Lockout tag' })] }, [], 'edit', asked))).toBe(0);
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

  it('marks a question added to a service that has its own screen', () => {
    expect(cleanForSave([q({ key: 'a', label: 'Tag' })], true)[0].isExtra).toBe(true);
    expect(cleanForSave([q({ key: 'a', label: 'Tag' })])[0].isExtra).toBeUndefined();
    // Already marked stays marked, whatever the caller passes.
    expect(cleanForSave([q({ key: 'a', label: 'Tag', isExtra: true })])[0].isExtra).toBe(true);
  });
});

describe('a built-in service’s two halves', () => {
  // Diesel's fieldsConfig describes the 21 columns its own screen collects.
  // Treating those as questions is what made the form ask for Timestamp,
  // Email Address and Entity a second time, below the form that just asked.
  const config = [
    q({ key: 'timestamp', label: 'Timestamp', type: 'text' }),
    q({ key: 'emailAddress', label: 'Email Address', type: 'text' }),
    q({ key: 'lockoutTagNo', label: 'Lockout tag', type: 'text', isExtra: true }),
  ];

  it('asks only for what was added', () => {
    expect(extraFields(config).map((f) => f.key)).toEqual(['lockoutTagNo']);
  });

  it('asks for nothing at all before anything is added', () => {
    expect(extraFields(config.slice(0, 2))).toEqual([]);
    expect(extraFields(undefined)).toEqual([]);
  });

  it('keeps the screen’s own columns apart, so publishing cannot drop them', () => {
    expect(builtInFields(config).map((f) => f.key)).toEqual(['timestamp', 'emailAddress']);
  });
});

describe('building from a spreadsheet header', () => {
  it('guesses the answer type from the column name', () => {
    expect(guessFieldType('POD photo')).toBe('evidence');
    expect(guessFieldType('Drive link')).toBe('evidence');
    expect(guessFieldType('Remarks')).toBe('textarea');
    expect(guessFieldType('UPS Availability (%)')).toBe('percentage');
    expect(guessFieldType('Chiller temperature')).toBe('temperature');
    expect(guessFieldType('Is the DG working')).toBe('boolean');
    expect(guessFieldType('Date of service')).toBe('date');
    expect(guessFieldType('Start time')).toBe('time');
    expect(guessFieldType('Diesel quantity (L)')).toBe('number');
    expect(guessFieldType('DG run hrs')).toBe('number');
    expect(guessFieldType('Vendor name')).toBe('text');
  });

  it('splits a pasted header row however it was copied', () => {
    expect(parseList('Date\tSite\tRemarks')).toEqual(['Date', 'Site', 'Remarks']);
    expect(parseList('Date, Site; Remarks | Photo')).toEqual(['Date', 'Site', 'Remarks', 'Photo']);
    expect(parseList('Date\nSite\n\n  Date  ')).toEqual(['Date', 'Site']);
    expect(parseList('"Cost Center"')).toEqual(['Cost Center']);
    expect(parseList('a,b,c', 2)).toEqual(['a', 'b']);
  });

  it('turns a header row into questions with unique saved names', () => {
    const fields = columnsToFields('Chiller temp\tRemarks\tChiller temp', ['reading']);
    expect(fields.map((f) => f.key)).toEqual(['chillerTemp', 'remarks']);
    expect(fields.map((f) => f.type)).toEqual(['temperature', 'textarea']);
    expect(fields[0].unit).toBe('°C');
    expect(problemCount(validateDraft({ name: 'Cold room', code: 'COLD', fields }, [], 'create'))).toBe(0);
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
