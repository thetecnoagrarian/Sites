// Get base URL from request or environment, fallback to production domain
function getBaseUrl(req) {
  if (req) {
    const protocol = req.protocol || 'https';
    const host = req.get('host') || req.hostname;
    if (host) {
      return `${protocol}://${host}`;
    }
  }
  // Fallback to environment variable or production domain
  return process.env.BASE_URL || 'https://www.fruitionforestgarden.com';
}

function buildOgTags(post, req = null) {
  const baseUrl = getBaseUrl(req);
  const title = post?.title || 'Fruition Forest Garden';
  const desc = post?.description || (post?.content ? post.content.substring(0, 160) + '...' : 'A blog about our adventure building our homestead on a undeveloped 20 acres in Michigan\'s Upper Peninsula.');
  const url = post ? `${baseUrl}/post/${post.slug || ''}` : `${baseUrl}/`;
  
  // Debug log for images
  if (post) {
    console.log('OG IMAGES DEBUG:', post.images);
    console.log('OG IMAGELIST DEBUG:', post.imageList);
  }
  
  // Use the first image from imageList (carousel) if available, fallback to images array
  // Use optimized OG version (HeroCamp-og.png) for social sharing - smaller file size, Facebook-compliant
  let image = `${baseUrl}/images/HeroCamp-og.png`;
  let imageAlt = 'Aerial view of Fruition Forest Garden';
  
  if (post) {
    if (Array.isArray(post.imageList) && post.imageList[0] && post.imageList[0].medium) {
      image = `${baseUrl}${post.imageList[0].medium}`;
      imageAlt = post.imageList[0].caption || post.title || 'Fruition Forest Garden';
    } else if (Array.isArray(post.images) && post.images[0] && post.images[0].medium) {
      image = `${baseUrl}${post.images[0].medium}`;
      imageAlt = post.title || 'Fruition Forest Garden';
    }
  }
  
  return `
    <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta property="og:description" content="${desc.replace(/"/g, '&quot;')}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:alt" content="${imageAlt.replace(/"/g, '&quot;')}" />
    <meta property="og:type" content="${post ? 'article' : 'website'}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@fruitionforestgarden" />
    <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta name="twitter:description" content="${desc.replace(/"/g, '&quot;')}" />
    <meta name="twitter:image" content="${image}" />
  `;
}

// Remove the Express middleware and res.send interception logic
export default buildOgTags; 