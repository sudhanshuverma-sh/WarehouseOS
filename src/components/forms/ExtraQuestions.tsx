import React, { useMemo, useState } from 'react';
import type { FieldDefinition } from '../../types';
import { useApp } from '../../context/AppContext';
import { sheetIdFor } from '../../lib/services/serviceCodes';
import { ServiceFieldList, collectEntry } from './ServiceFieldList';
import { extraFields } from '../../lib/services/formBuilder';
import type { EvidenceValue } from '../common/EvidenceInput';

/**
 * Questions added to a service that already has a screen of its own.
 *
 * ONLY those: a service's `fieldsConfig` also describes the columns its own
 * screen asks for, and a POC filing the diesel request must not be asked for
 * the rate, the entity or the timestamp a second time at the bottom of it.
 * `extraFields` is that line — without it this section renders the whole form
 * again. Each built-in screen renders `node` and sends `collect()` with its
 * payload, so a new column is two lines per screen instead of a new input.
 */

interface ExtraQuestions {
  /** The questions an admin added, empty when none. */
  fields: FieldDefinition[];
  /** The section to render at the end of the form; null when there is nothing to ask. */
  node: React.ReactNode;
  /** Answers to send, or null when one of them is missing or out of range. */
  collect: () => Record<string, unknown> | null;
  reset: () => void;
}

export function useExtraQuestions(serviceCode: string, siteCode?: string): ExtraQuestions {
  const { operationalSheets } = useApp();
  const fields = useMemo<FieldDefinition[]>(
    () => extraFields(operationalSheets.find((s) => s.id === sheetIdFor(serviceCode))?.fieldsConfig),
    [operationalSheets, serviceCode],
  );

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [evidence, setEvidence] = useState<Record<string, EvidenceValue | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setValues({});
    setEvidence({});
    setErrors({});
  };

  const collect = () => {
    if (fields.length === 0) return {};
    const entry = collectEntry(fields, values, evidence);
    setErrors(entry.errors);
    return Object.keys(entry.errors).length > 0 ? null : entry.data;
  };

  const node =
    fields.length === 0 ? null : (
      <section className="bg-white border border-slate-200 rounded-(--r-card) p-4 shadow-xs">
        <h3 className="text-sm font-semibold text-slate-900">More questions</h3>
        <p className="mt-0.5 mb-4 text-xs text-slate-500">Added for this service by your admin.</p>
        <ServiceFieldList
          fields={fields}
          values={values}
          onValue={(key, value) => {
            setValues((v) => ({ ...v, [key]: value }));
            setErrors(({ [key]: _drop, ...rest }) => rest);
          }}
          evidence={evidence}
          onEvidence={(key, value) => {
            setEvidence((e) => ({ ...e, [key]: value }));
            setErrors(({ [key]: _drop, ...rest }) => rest);
          }}
          errors={errors}
          serviceCode={serviceCode}
          siteCode={siteCode}
          idPrefix={`extra-${serviceCode.toLowerCase()}`}
        />
      </section>
    );

  return { fields, node, collect, reset };
}
