import assert from 'node:assert/strict';
import test from 'node:test';

import buildFfgOgTags from '../fruitionforestgarden/src/middleware/ogTags.js';
import buildTtaOgTags from '../thetecnoagrarian/src/middleware/ogTags.js';

const cases = [
  ['TTA', (metadata) => buildTtaOgTags(null, metadata)],
  ['FFG', (metadata) => buildFfgOgTags(null, null, metadata)]
];

for (const [site, buildTags] of cases) {
  test(`${site} escapes static-page metadata before inserting raw head markup`, async () => {
    const tags = await buildTags({
      title: 'About "Us" & <Friends>',
      description: 'Safe "copy" & <script>markup</script>',
      url: 'https://example.com/about?one=1&two=2'
    });

    assert.match(tags, /content="About &quot;Us&quot; &amp; &lt;Friends&gt;"/);
    assert.match(tags, /content="Safe &quot;copy&quot; &amp; &lt;script&gt;markup&lt;\/script&gt;"/);
    assert.match(tags, /content="https:\/\/example\.com\/about\?one=1&amp;two=2"/);
    assert.doesNotMatch(tags, /<Friends>/);
    assert.doesNotMatch(tags, /<script>/);
  });
}
