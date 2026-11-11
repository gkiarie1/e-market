import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativePhotoModule, webPhotoModule, NativeFormData, photoBytes, convertFormDataAsync, nativeApiModule } from './helpers/photo-contract.mjs';

test('native picker file is accepted by the installed Expo multipart encoder', async () => {
  const form = await nativePhotoModule().createPhotoForm('file:///cache/produce.png');
  const { body, boundary } = await convertFormDataAsync(form);
  const text = new TextDecoder().decode(body);
  assert.match(text, /name="file"; filename="produce.png"/);
  assert.match(text, /content-type: image\/png/);
  assert.ok(Buffer.from(body).includes(Buffer.from(photoBytes)), 'photo bytes must survive encoding');
  assert.ok(text.endsWith(`--${boundary}--\r\n`));
});

test('legacy URI descriptors reproduce the SDK error this change fixes', async () => {
  const legacy = new NativeFormData();
  legacy.append('file', { uri: 'file:///cache/produce.png', name: 'produce.png', type: 'image/png' });
  await assert.rejects(convertFormDataAsync(legacy), /Unsupported FormDataPart implementation/);
});

test('missing and oversized native photos fail before uploading', async () => {
  await assert.rejects(nativePhotoModule({exists:false}).createPhotoForm('file:///missing.png'), /choose or take it again/);
  await assert.rejects(nativePhotoModule({size:8 * 1024 * 1024 + 1}).createPhotoForm('file:///large.png'), /smaller than 8 MB/);
});

test('web uploads still send real photo bytes under the file field', async () => {
  const uri = `data:image/png;base64,${Buffer.from(photoBytes).toString('base64')}`;
  const form = await webPhotoModule().createPhotoForm(uri);
  const file = form.get('file');
  assert.equal(file.type, 'image/png');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), photoBytes);
  const encoded = await convertFormDataAsync(form);
  assert.ok(Buffer.from(encoded.body).includes(Buffer.from(photoBytes)));
});

test('upload request preserves authentication and lets fetch set the multipart boundary', async () => {
  let sent;
  const api = nativeApiModule(async (url, options) => {
    sent = { url, ...options };
    // Exercise the same encoder used by Expo fetch for the body we actually send.
    await convertFormDataAsync(options.body);
    return { ok: true, status: 201, json: async () => ({path:'/uploads/produce.jpg'}) };
  });
  api.setToken('test-session-token');
  assert.equal((await api.uploadPhoto('file:///cache/produce.png')).path, '/uploads/produce.jpg');
  assert.equal(sent.url, 'http://marketplace.test/photos');
  assert.equal(sent.method, 'POST');
  assert.equal(sent.headers.Authorization, 'Bearer test-session-token');
  assert.ok(!('Content-Type' in sent.headers), 'fetch must generate a matching multipart boundary');
  assert.ok(sent.body instanceof NativeFormData);
});
