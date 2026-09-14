import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '../../types';
import { isGoogleDriveLink, validateSubmissionData } from './validateSubmission';

const field = (over: Partial<FieldDefinition>): FieldDefinition => ({
  key: 'k',
  label: 'Value',
  type: 'text',
  required: false,
  ...over,
});

const messages = (fields: FieldDefinition[], data: Record<string, unknown>) =>
  validateSubmissionData(fields, data).map((e) => e.message);

describe('validateSubmissionData', () => {
  it('requires required fields and ignores blank optional ones', () => {
    const fields = [field({ key: 'a', label: 'Agency', required: true }), field({ key: 'b' })];
    expect(messages(fields, { a: '  ', b: '' })).toEqual(['Agency is required.']);
    expect(messages(fields, { a: 'SMS' })).toEqual([]);
  });

  it('checks numbers and their limits', () => {
    const f = [field({ type: 'number', label: 'Count', min: 0, max: 50 })];
    expect(messages(f, { k: 'ten' })).toEqual(['Count must be a number.']);
    expect(messages(f, { k: -1 })).toEqual(['Count must be at least 0.']);
    expect(messages(f, { k: '51' })).toEqual(['Count must be at most 50.']);
    expect(messages(f, { k: '12' })).toEqual([]);
    expect(messages(f, { k: true })).toEqual(['Count must be a number.']);
  });

  it('keeps percentages within 0-100 even when the form sets no limits', () => {
    const f = [field({ type: 'percentage', label: 'Deployment' })];
    expect(messages(f, { k: 101 })).toEqual(['Deployment must be at most 100.']);
    expect(messages(f, { k: 100 })).toEqual([]);
  });

  it('checks select options, dates, times and booleans', () => {
    expect(messages([field({ type: 'select', label: 'Agency', options: ['SMS', 'Vedanta'] })], { k: 'Other' })).toEqual([
      'Agency must be one of SMS, Vedanta.',
    ]);
    expect(messages([field({ type: 'date', label: 'Date' })], { k: '14/09/2026' })).toHaveLength(1);
    expect(messages([field({ type: 'time', label: 'Time' })], { k: '25:00' })).toHaveLength(1);
    expect(messages([field({ type: 'boolean', label: 'OK' })], { k: 'Yes' })).toEqual([]);
    expect(messages([field({ type: 'boolean', label: 'OK' })], { k: 'maybe' })).toHaveLength(1);
  });

  it('accepts an attachment id as evidence and nothing else', () => {
    const f = [field({ type: 'evidence', label: 'Photo', required: true })];
    expect(messages(f, { k: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' })).toEqual([]);
    expect(messages(f, { k: 'data:image/jpeg;base64,AAAA' })).toEqual([
      'Photo: attach a link.',
    ]);
  });
});

describe('isGoogleDriveLink', () => {
  it('accepts Drive and Docs share links only', () => {
    expect(isGoogleDriveLink('https://drive.google.com/file/d/abc/view')).toBe(true);
    expect(isGoogleDriveLink(' https://docs.google.com/document/d/abc ')).toBe(true);
    expect(isGoogleDriveLink('http://drive.google.com/file/d/abc')).toBe(false);
    expect(isGoogleDriveLink('https://drive.google.com.evil.test/x')).toBe(false);
    expect(isGoogleDriveLink('https://example.com/pod.jpg')).toBe(false);
    expect(isGoogleDriveLink(42)).toBe(false);
  });
});
