const DEFAULT_OG = `
  <meta property="og:title" content="Fruition Forest Garden" />
  <meta property="og:description" content="A blog about our adventure building our homestead on a bare 20 acres in Michigan's Upper Peninsula." />
  <meta property="og:url" content="https://www.fruitionforestgarden.com/" />
  <meta property="og:image" content="https://www.fruitionforestgarden.com/images/HeroCamp.png" />
  <meta property="og:image:alt" content="Aerial view of Fruition Forest Garden" />
  <meta property="og:type" content="website" />
`;

function buildOgTags(post) {
  if (!post) return DEFAULT_OG;
  const title = post.title || 'Fruition Forest Garden';
  const desc = post.description || (post.content ? post.content.substring(0, 160) + '...' : 'A blog about our adventure building our homestead on a bare 20 acres in Michigan\'s Upper Peninsula.');
  const url = `https://www.fruitionforestgarden.com/post/${post.slug || ''}`;
  
  // Debug log for images
  console.log('OG IMAGES DEBUG:', post.images);
  console.log('OG IMAGELIST DEBUG:', post.imageList);
  
  // Use the first image from imageList (carousel) if available, fallback to images array
  let image = 'https://www.fruitionforestgarden.com/images/HeroCamp.png';
  let imageAlt = 'Fruition Forest Garden';
  
  if (Array.isArray(post.imageList) && post.imageList[0] && post.imageList[0].medium) {
    image = `https://www.fruitionforestgarden.com${post.imageList[0].medium}`;
    imageAlt = post.imageList[0].caption || post.title || 'Fruition Forest Garden';
  } else if (Array.isArray(post.images) && post.images[0] && post.images[0].medium) {
    image = `https://www.fruitionforestgarden.com${post.images[0].medium}`;
    imageAlt = post.title || 'Fruition Forest Garden';
  }
  
  return `
    <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta property="og:description" content="${desc.replace(/"/g, '&quot;')}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:alt" content="${imageAlt.replace(/"/g, '&quot;')}" />
    <meta property="og:type" content="article" />
  `;
}

// Remove the Express middleware and res.send interception logic
export default buildOgTags; 