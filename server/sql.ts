/**
 * Parameterised insert/update builders for rows whose column names come
 * from our own code (normaliseSnapshot), never from a request. Values are
 * always parameters.
 */

export interface SqlPlan {
  text: string;
  values: unknown[];
}

export function buildInsert(table: string, values: Record<string, unknown>): SqlPlan {
  const cols = Object.keys(values);
  return {
    text: `insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
    values: cols.map((c) => values[c]),
  };
}

/** Updates every given column except the key, which never changes (I2). */
export function buildUpdate(table: string, keyColumn: string, key: string, values: Record<string, unknown>): SqlPlan {
  const cols = Object.keys(values).filter((c) => c !== keyColumn);
  return {
    text:
      `update ${table} set ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} ` +
      `where ${keyColumn} = $${cols.length + 1} returning *`,
    values: [...cols.map((c) => values[c]), key],
  };
}
