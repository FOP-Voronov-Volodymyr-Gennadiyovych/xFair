const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

const app = require('../index');

let baseUrl;
let server;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('serves a file input named upfile', async () => {
  const response = await fetch(baseUrl);
  const html = await response.text();
  assert.match(html, /<input[^>]+type="file"[^>]+name="upfile"/);
});

test('returns the uploaded file metadata', async () => {
  const data = Buffer.from([0, 1, 2, 3, 255]);
  const form = new FormData();
  form.append('upfile', new Blob([data], { type: 'image/png' }), 'icon');

  const response = await fetch(`${baseUrl}/api/fileanalyse`, {
    method: 'POST',
    body: form
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    name: 'icon',
    type: 'image/png',
    size: 5
  });
});
