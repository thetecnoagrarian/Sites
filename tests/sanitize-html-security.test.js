const assert = require('node:assert/strict');
const test = require('node:test');

const sanitizeHtml = require('sanitize-html');

const intendedPostBodyPolicy = {
  allowedTags: [
    'address', 'article', 'aside', 'footer', 'header', 'h1', 'h2', 'h3',
    'h4', 'h5', 'h6', 'hgroup', 'main', 'nav', 'section', 'blockquote',
    'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'hr', 'li', 'menu',
    'ol', 'p', 'pre', 'ul', 'a', 'abbr', 'b', 'bdi', 'bdo', 'br',
    'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 'rb',
    'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'small', 'span', 'strong',
    'sub', 'sup', 'time', 'u', 'var', 'wbr', 'caption', 'col',
    'colgroup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
    'img'
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target'],
    img: ['src', 'alt', 'title', 'width', 'height', 'style']
  },
  allowedSchemes: ['http', 'https', 'ftp', 'mailto', 'tel'],
  allowProtocolRelative: true
};

test('sanitize-html 2.17.5 preserves representative intended rich content', () => {
  const input = [
    '<h2>Heading</h2>',
    '<p>Paragraph with <a href="https://example.com">a link</a>, <strong>strong</strong>, <em>emphasis</em>, and <u>underline</u>.</p>',
    '<ul><li>First</li><li>Second</li></ul>',
    '<blockquote>Quoted text</blockquote>',
    '<figure><img src="/uploads/example.webp" alt="Example" title="Example image" width="640" height="480" style="max-width:100%"><figcaption>Caption</figcaption></figure>',
    '<table><thead><tr><th>Column</th></tr></thead><tbody><tr><td>Value</td></tr></tbody></table>',
    '<pre><code>const value = 1;</code></pre>'
  ].join('');

  const output = sanitizeHtml(input, intendedPostBodyPolicy);

  for (const fragment of [
    '<h2>Heading</h2>',
    '<a href="https://example.com">a link</a>',
    '<strong>strong</strong>',
    '<em>emphasis</em>',
    '<u>underline</u>',
    '<ul><li>First</li><li>Second</li></ul>',
    '<blockquote>Quoted text</blockquote>',
    '<figure>',
    '<img src="/uploads/example.webp"',
    '<figcaption>Caption</figcaption>',
    '<table>',
    '<pre><code>const value = 1;</code></pre>'
  ]) {
    assert.ok(output.includes(fragment), `expected sanitized output to contain ${fragment}`);
  }
});

test('intended post-body policy removes representative dangerous markup', () => {
  const input = [
    '<script>marker()</script>',
    '<img src="/uploads/example.webp" onerror="marker()">',
    '<a href="javascript:void(0)">unsafe link</a>',
    '<svg onload="marker()"><circle></circle></svg>',
    '<iframe src="https://example.com"></iframe>',
    '<object data="https://example.com"></object>',
    '<embed src="https://example.com">',
    '<style>body { color: red; }</style>'
  ].join('');

  const output = sanitizeHtml(input, intendedPostBodyPolicy);

  for (const forbidden of [
    '<script', 'onerror', 'javascript:', '<svg', '<circle', '<iframe',
    '<object', '<embed', '<style'
  ]) {
    assert.ok(!output.toLowerCase().includes(forbidden), `expected sanitized output to remove ${forbidden}`);
  }

  assert.ok(output.includes('<img src="/uploads/example.webp" />'));
  assert.ok(output.includes('<a>unsafe link</a>'));
});

test('sanitize-html 2.17.5 rejects javascript schemes in advisory-relevant attributes', () => {
  const advisoryRegressionPolicy = {
    allowedTags: ['form', 'button', 'object', 'video', 'table', 'tbody', 'tr', 'td'],
    allowedAttributes: {
      form: ['action'],
      button: ['formaction'],
      object: ['data'],
      video: ['poster'],
      table: ['background'],
      td: ['background']
    },
    allowedSchemes: ['http', 'https']
  };

  const input = [
    '<form action="javascript:marker()">Form</form>',
    '<button formaction="javascript:marker()">Button</button>',
    '<object data="javascript:marker()">Object</object>',
    '<video poster="javascript:marker()">Video</video>',
    '<table background="javascript:marker()"><tbody><tr><td background="javascript:marker()">Cell</td></tr></tbody></table>'
  ].join('');

  const output = sanitizeHtml(input, advisoryRegressionPolicy);

  assert.ok(!output.toLowerCase().includes('javascript:'));
  for (const attribute of ['action=', 'formaction=', 'data=', 'poster=', 'background=']) {
    assert.ok(!output.toLowerCase().includes(attribute), `expected sanitizer to remove unsafe ${attribute}`);
  }
});
