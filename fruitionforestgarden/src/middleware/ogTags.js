import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Check if hero OG image exists (WebP format)
async function getHeroOgImagePath() {
  const imagesDir = path.join(process.cwd(), 'src/public/images');
  
  // Priority 1: Check for uploaded OG image (HeroCamp-og.webp)
  const ogPath = path.join(imagesDir, 'HeroCamp-og.webp');
  try {
    await fs.access(ogPath);
    return '/images/HeroCamp-og.webp';
  } catch {
    // Priority 2: Fallback to uploaded hero image (HeroCamp.webp)
    const heroPath = path.join(imagesDir, 'HeroCamp.webp');
    try {
      await fs.access(heroPath);
      return '/images/HeroCamp.webp';
    } catch {
      // Priority 3: Fallback to about page hero image (HeroCamp.png)
      const defaultHeroPath = path.join(imagesDir, 'HeroCamp.png');
      try {
        await fs.access(defaultHeroPath);
        return '/images/HeroCamp.png';
      } catch {
        // Priority 4: Final fallback to old OG PNG if it exists
        const oldOgPath = path.join(imagesDir, 'HeroCamp-og.png');
        try {
          await fs.access(oldOgPath);
          return '/images/HeroCamp-og.png';
        } catch {
          return null;
        }
      }
    }
  }
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
    const heroOgPath = await getHeroOgImagePath();
    if (heroOgPath) {
      image = `${baseUrl}${heroOgPath}`;
    } else {
      // Final fallback to about page hero image
      image = `${baseUrl}/images/HeroCamp.png`;
    }
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
