// Install alongside @vercel/blob@2.3.0; credentials stay in a root-only env file.
import { put, get } from '@vercel/blob';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
const [command, source, destination] = process.argv.slice(2);
if (command === 'put') {
  const result = await put(destination, createReadStream(source), {
    access: 'private', multipart: true, addRandomSuffix: false,
  });
  console.log(JSON.stringify({ pathname: result.pathname }));
} else if (command === 'get') {
  const result = await get(source, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) throw new Error('Backup unavailable');
  await pipeline(result.stream, createWriteStream(destination, { mode: 0o600 }));
} else {
  throw new Error('Expected put <file> <pathname> or get <pathname> <file>');
}
