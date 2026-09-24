import { describe, expect, it } from 'vitest';
import { exportFormJson, importForm } from './formImport';

/**
 * Forms pasted in from elsewhere — most often an AI-made HTML page or a JSON
 * description — become builder questions without anything being run.
 */

// The shape of the reference "Fire Pump Healthiness" page: the questions are
// a list in its script, and the page draws them itself.
const FIRE_PAGE = `<!DOCTYPE html><html><head><title>Fire Pump Healthiness — daily check</title></head>
<body><h1>Fire Pump Healthiness</h1><div class="card" id="form"></div>
<script>
const state={};
const CHECKS=[
 {id:'fire_alarm',g:'Detection',label:'Is the fire alarm system working OK?',opts:['Yes','No'],good:'Yes'},
 {id:'mcp',g:'Detection',label:'Are all MCPs (manual call points) OK?',opts:['Yes','No'],good:'Yes'},
 {id:'pump_room',g:'Pump room',label:'Fire pump room operation',opts:['Operational','Non operational'],good:'Operational'},
 {id:'hydrant_pressure',g:'Pump room',label:'Pressure maintained for hydrant pump?',opts:['Yes','No'],good:'Yes',
  extra:{label:'Pressure reading (bar)',ph:'e.g. 7.0'}},
 // Availability is a fact about the site, not a fault.
 {id:'sprinkler_available',g:'Sprinkler',label:'Is a fire sprinkler system available?',
  opts:['Yes','No'],neutral:true},
 {id:'sprinkler_charged',g:'Sprinkler',label:'Is the sprinkler line charged?',
  opts:['Yes','No'],good:'Yes',showIf:()=>state.sprinkler_available?.value==='Yes'},
];
function render(){ document.getElementById('form').innerHTML = CHECKS.map(c => c.label).join(''); }
render();
</script></body></html>`;

describe('importForm — an AI-made HTML page', () => {
  const result = importForm(FIRE_PAGE);

  it('reads the questions out of the page script, with its title', () => {
    expect(result.source).toBe('script');
    expect(result.title).toBe('Fire Pump Healthiness — daily check');
  });

  it('turns each group into a section heading, in order', () => {
    expect(result.fields.map((f) => (f.type === 'section' ? `# ${f.label}` : f.key))).toEqual([
      '# Detection',
      'fire_alarm',
      'mcp',
      '# Pump room',
      'pump_room',
      'hydrant_pressure',
      'pressureReadingBar',
      '# Sprinkler',
      'sprinkler_available',
      'sprinkler_charged',
    ]);
  });

  it('knows Yes/No questions from dropdowns, and a reading beside an answer', () => {
    const by = new Map(result.fields.map((f) => [f.key, f]));
    expect(by.get('fire_alarm')).toMatchObject({ type: 'boolean', required: true });
    expect(by.get('pump_room')).toMatchObject({ type: 'select', options: ['Operational', 'Non operational'] });
    expect(by.get('pressureReadingBar')).toMatchObject({ type: 'number', unit: 'bar', required: false, helperText: 'e.g. 7.0' });
  });

  it('turns "good" answers into a follow-up: anything else asks why, takes a photo, and is an issue', () => {
    const by = new Map(result.fields.map((f) => [f.key, f]));
    expect(by.get('fire_alarm')?.followUp).toEqual({ when: ['No'], comment: 'required', photo: 'optional', issue: true });
    expect(by.get('pump_room')?.followUp?.when).toEqual(['Non operational']);
    expect(by.get('sprinkler_available')?.followUp).toBeUndefined(); // neutral: no answer is a fault
  });

  it('reads a show-if written as a function, without running it', () => {
    const charged = result.fields.find((f) => f.key === 'sprinkler_charged');
    expect(charged?.showIf).toEqual({ field: 'sprinkler_available', equals: ['Yes'] });
  });
});

describe('importForm — JSON', () => {
  it('takes a list of fields with loose names for everything', () => {
    const { fields, title, source } = importForm(
      JSON.stringify({
        title: 'UPS check',
        questions: [
          { question: 'Battery voltage', type: 'number', unit: 'V', min: 0, max: 300, required: true },
          { question: 'Any alarms?', type: 'yes/no', followUp: { when: ['Yes'], comment: 'required', photo: 'optional', issue: true } },
          { question: 'Panel condition', type: 'radio', choices: [{ label: 'Good' }, { label: 'Needs repair' }], bad: 'Needs repair' },
          { question: 'Alarm code', dependsOn: { question: 'anyAlarms', value: 'Yes' } },
          { question: 'Photo of panel', type: 'image' },
        ],
      }),
    );
    expect(source).toBe('json');
    expect(title).toBe('UPS check');
    expect(fields.map((f) => [f.label, f.type])).toEqual([
      ['Battery voltage', 'number'],
      ['Any alarms?', 'boolean'],
      ['Panel condition', 'select'],
      ['Alarm code', 'text'],
      ['Photo of panel', 'evidence'],
    ]);
    expect(fields[0]).toMatchObject({ unit: 'V', min: 0, max: 300, required: true });
    expect(fields[1].followUp).toEqual({ when: ['Yes'], comment: 'required', photo: 'optional', issue: true });
    expect(fields[2].followUp).toMatchObject({ when: ['Needs repair'], issue: true });
    expect(fields[3].showIf).toEqual({ field: 'anyAlarms', equals: ['Yes'] });
  });

  it('reads grouped sections, and JSON with comments or trailing commas', () => {
    const { fields } = importForm(`{
      // written by an assistant
      "sections": [
        { "title": "Room", "questions": [ { "label": "Door closed?", "type": "boolean" }, ] },
        { "title": "Readings", "questions": [ { "label": "Temperature", "type": "temperature" } ] },
      ],
    }`);
    expect(fields.map((f) => `${f.type}:${f.label}`)).toEqual(['section:Room', 'boolean:Door closed?', 'section:Readings', 'temperature:Temperature']);
  });

  it('drops a show-if that points at a later question, and says so', () => {
    const { fields, notes } = importForm(
      JSON.stringify([
        { id: 'first', label: 'First', showIf: { field: 'second', equals: 'Yes' } },
        { id: 'second', label: 'Second', type: 'boolean' },
      ]),
    );
    expect(fields[0].showIf).toBeUndefined();
    expect(notes[0]).toMatch(/always asked/);
  });

  it('round-trips what it exports', () => {
    const { fields } = importForm(FIRE_PAGE);
    const again = importForm(exportFormJson('Fire', fields));
    expect(again.fields).toEqual(fields);
  });

  it('explains what it could not read', () => {
    expect(importForm('{ nope').notes[0]).toMatch(/could not be read/);
    expect(importForm('{"a":1}').notes[0]).toMatch(/No list of questions/);
    expect(importForm('').fields).toEqual([]);
  });
});

describe('importForm — a plain list', () => {
  it('treats one name per line as questions, guessing each type', () => {
    const { fields, source } = importForm('Chiller temp\nDoor seal OK?\nRemarks');
    expect(source).toBe('list');
    expect(fields.map((f) => f.type)).toEqual(['temperature', 'boolean', 'textarea']);
  });
});
