import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Script } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
// Only native file I/O is mocked. The encoder below is the installed Expo SDK's
// real implementation, so this catches unsupported multipart parts on upgrades.
function loadSource(file, dependencies = {}, globals = {}) {
  const source = readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Script(code, { filename: String(file) }).runInNewContext({
    module, exports: module.exports,
    require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
    Blob, FormData, fetch, TextEncoder, Uint8Array, AbortController, setTimeout, clearTimeout, process: { env: { EXPO_PUBLIC_API_URL: 'http://marketplace.test' } }, ...globals,
  });
  return module.exports;
}
export class NativeFormData {
  parts = [];
  append(name, value) { this.parts.push([name, value]); }
  entries() { return this.parts.values(); }
}
export const photoBytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8v5SBgYGBiYGBgYGBAQAU2QGo4jF1qQAAAABJRU5ErkJggg==', 'base64'));
export function nativePhotoModule({ exists = true, size = photoBytes.length } = {}) {
  class NativeFile {
    constructor(uri) { this.uri = uri; this.name = uri.split('/').at(-1); this.type = 'image/png'; this.exists = exists; this.size = size; }
    async bytes() { return photoBytes; }
  }
  return loadSource(new URL('../../src/photoForm.native.ts', import.meta.url), { 'expo-file-system': { File: NativeFile } }, { FormData: NativeFormData });
}
export const webPhotoModule = () => loadSource(new URL('../../src/photoForm.ts', import.meta.url));
const expoDirectory = dirname(require.resolve('expo/package.json'));
export const { convertFormDataAsync } = loadSource(join(expoDirectory, 'src/winter/fetch/convertFormData.ts'), {
  '../../utils/blobUtils': { blobToArrayBufferAsync: blob => blob.arrayBuffer() },
});

export function nativeApiModule(fetchImplementation) {
  return loadSource(new URL('../../src/api.ts', import.meta.url), { './photoForm': nativePhotoModule() }, { FormData: NativeFormData, fetch: fetchImplementation });
}
