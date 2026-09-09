import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { briefSchema } from '../../web/src/lib/executive/brief';

type Description = { type: string; optional?: boolean; fields?: Record<string, Description>; innerType?: Description; oneOf?: unknown[]; tests?: { name?: string; params?: Record<string, unknown> }[] };
function schema(value: Description): Record<string, unknown> {
  const result: Record<string, unknown> = { type: value.type === 'mixed' ? 'string' : value.type };
  if (value.oneOf?.length) result.enum = value.oneOf;
  if (value.fields) {
    result.properties = Object.fromEntries(Object.entries(value.fields).map(([key, field]) => [key, schema(field)]));
    result.required = Object.keys(value.fields).filter(key => !["quote", "url"].includes(key));
    result.additionalProperties = false;
  }
  if (value.innerType) result.items = schema(value.innerType);
  for (const test of value.tests ?? []) {
    const suffix = value.type === 'array' ? 'Items' : value.type === 'string' ? 'Length' : '';
    if (test.name === 'min') result[suffix ? `min${suffix}` : 'minimum'] = test.params?.min;
    if (test.name === 'max') result[suffix ? `max${suffix}` : 'maximum'] = test.params?.max;
    if (test.name === 'length') { result[`min${suffix}`] = test.params?.length; result[`max${suffix}`] = test.params?.length; }
    if (test.name === 'matches') result.pattern = String(test.params?.regex).slice(1, -1);
  }
  return result;
}
const output = schema(briefSchema.describe() as Description);
(output.properties as Record<string, unknown>).version = { type: 'integer', enum: [2] };
output.required = Object.keys(output.properties as object);
const path = resolve('backend/onyx/server/query_and_chat/burn2/brief.schema.json');
const content = JSON.stringify(output, null, 2) + '\n';
if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8') !== content) throw new Error('Brief schema drift'); } else writeFileSync(path, content);
