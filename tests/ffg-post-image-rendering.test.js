const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Handlebars = require('handlebars');

const templatePath = path.join(
  __dirname,
  '..',
  'fruitionforestgarden',
  'src',
  'views',
  'posts',
  'show.hbs'
);

const handlebars = Handlebars.create();
handlebars.registerPartial('layouts/main', '{{> @partial-block}}');
handlebars.registerHelper('formatDate', (value) => String(value || ''));
handlebars.registerHelper('json', (value) => JSON.stringify(value));

const renderTemplate = handlebars.compile(fs.readFileSync(templatePath, 'utf8'));

const image = (name) => ({
  thumbnail: `/uploads/${name}-thumbnail.webp`,
  medium: `/uploads/${name}-medium.webp`,
  large: `/uploads/${name}-large.webp`
});

const renderPost = (images, captions = []) => {
  const imageList = images.map((entry, index) => ({
    ...entry,
    caption: captions[index] || ''
  }));

  return renderTemplate({
    post: {
      title: 'Synthetic image rendering post',
      body: '<p>Synthetic post body.</p>',
      images,
      imageList,
      multipleImages: imageList.length > 1,
      captions
    }
  });
};

const postImageTags = (html) => (
  html.match(/<img[^>]*class="lightbox-trigger post-image"[^>]*>/g) || []
);

test('FFG post detail emits no post image markup for zero images', () => {
  const html = renderPost([]);

  assert.equal(postImageTags(html).length, 0);
  assert.doesNotMatch(html, /class="post-image-container"/);
  assert.doesNotMatch(html, /class="post-carousel"/);
  assert.match(html, /Synthetic post body/);
});

test('FFG post detail renders exactly one structured image without a carousel', () => {
  const html = renderPost([image('single')], ['Single synthetic caption']);
  const tags = postImageTags(html);

  assert.equal(tags.length, 1);
  assert.match(tags[0], /src="\/uploads\/single-medium\.webp"/);
  assert.match(tags[0], /data-full-img="\/uploads\/single-large\.webp"/);
  assert.match(tags[0], /data-caption="Single synthetic caption"/);
  assert.match(html, />Single synthetic caption<\/div>/);
  assert.doesNotMatch(html, /class="post-carousel"/);
});

test('FFG post detail preserves the structured multi-image carousel', () => {
  const html = renderPost(
    [image('first'), image('second')],
    ['First synthetic caption', 'Second synthetic caption']
  );
  const tags = postImageTags(html);

  assert.equal(tags.length, 2);
  assert.match(html, /class="post-carousel"/);
  assert.match(tags[0], /src="\/uploads\/first-medium\.webp"/);
  assert.match(tags[0], /data-full-img="\/uploads\/first-large\.webp"/);
  assert.match(tags[1], /src="\/uploads\/second-medium\.webp"/);
  assert.match(tags[1], /data-full-img="\/uploads\/second-large\.webp"/);
});
