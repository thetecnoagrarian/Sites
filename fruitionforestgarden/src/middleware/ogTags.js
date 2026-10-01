import { getHeroOgImage } from '../utils/heroImageProcessor.js';

export const SITE_DESCRIPTION = 'A blog about our adventure building our homestead on a undeveloped 20 acres in Michigan\'s Upper Peninsula.';

const escapePageAttribute = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

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

// Resolve the tracked/admin-managed WebP social image without falling back to
// the archival 19 MB source PNG.
async function getSiteImagePath(imagesDir = null) {
  const image = await getHeroOgImage(imagesDir);
  return image?.path || '/images/FFGnewLogo.PNG';
}

async function buildOgTags(post, req = null, pageMetadata = null) {
  const baseUrl = getBaseUrl(req);
  const title = pageMetadata?.title || post?.title || 'Fruition Forest Garden';
  const desc = pageMetadata?.description || post?.description || (post?.body ? post.body.substring(0, 160) + '...' : SITE_DESCRIPTION);
  const url = pageMetadata?.url || (post ? `${baseUrl}/post/${post.slug || ''}` : `${baseUrl}/`);
  const renderAttribute = pageMetadata
    ? escapePageAttribute
    : (value) => value.replace(/"/g, '&quot;');
  
  // Debug log for images
  if (post) {
    console.log('OG IMAGES DEBUG:', post.images);
    console.log('OG IMAGELIST DEBUG:', post.imageList);
  }
  
  // Use the first image from imageList (carousel) if available, fallback to images array
  // For homepage, use processed OG image (HeroCamp-og.webp) if available
  let image = null;
  let imageAlt = 'Aerial view of Fruition Forest Garden';
  
  if (post) {
    // For posts, use post images
    if (Array.isArray(post.imageList) && post.imageList[0] && post.imageList[0].medium) {
      image = `${baseUrl}${post.imageList[0].medium}`;
      imageAlt = post.imageList[0].caption || post.title || 'Fruition Forest Garden';
    } else if (Array.isArray(post.images) && post.images[0] && post.images[0].medium) {
      image = `${baseUrl}${post.images[0].medium}`;
      imageAlt = post.title || 'Fruition Forest Garden';
    }
  }
  
  // For homepage or if no post image, use hero OG image
  if (!image) {
    image = `${baseUrl}${await getSiteImagePath()}`;
  }
  
  return `
    <meta property="og:title" content="${renderAttribute(title)}" />
    <meta property="og:description" content="${renderAttribute(desc)}" />
    <meta property="og:url" content="${renderAttribute(url)}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:alt" content="${renderAttribute(imageAlt)}" />
    <meta property="og:type" content="${post ? 'article' : 'website'}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@fruitionforestgarden" />
    <meta name="twitter:title" content="${renderAttribute(title)}" />
    <meta name="twitter:description" content="${renderAttribute(desc)}" />
    <meta name="twitter:image" content="${image}" />
  `;
}

// Remove the Express middleware and res.send interception logic
export default buildOgTags;
export { getSiteImagePath };
