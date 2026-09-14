export const SITE_DESCRIPTION = 'Exploring the intersection of technology and horticulture';

const escapePageAttribute = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Default OG tags for the site
const defaultOGTags = `
<meta property="og:url" content="https://www.thetecnoagrarian.com/" />
<meta property="og:image" content="https://www.thetecnoagrarian.com/images/Hero.png" />
<meta property="og:image:alt" content="The Tecnoagrarian Logo" />
<meta property="og:title" content="The Tecnoagrarian" />
<meta property="og:description" content="${SITE_DESCRIPTION}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@thetecnoagrarian" />
<meta name="twitter:title" content="The Tecnoagrarian" />
<meta name="twitter:description" content="${SITE_DESCRIPTION}" />
<meta name="twitter:image" content="https://www.thetecnoagrarian.com/images/Hero.png" />
`;

// Generate OG tags for individual posts or an explicitly described static page.
function buildOgTags(post, pageMetadata = null) {
    if (!post && !pageMetadata) return defaultOGTags;
    
    const title = pageMetadata?.title || post?.title || 'The Tecnoagrarian';
    const desc = pageMetadata?.description || post?.description || (post?.body ? post.body.substring(0, 160).replace(/<[^>]*>/g, '') + '...' : SITE_DESCRIPTION);
    const url = pageMetadata?.url || `https://www.thetecnoagrarian.com/post/${post?.slug || ''}`;
    const renderAttribute = pageMetadata
        ? escapePageAttribute
        : (value) => value.replace(/"/g, '&quot;');
    
    // Default image
    let image = 'https://www.thetecnoagrarian.com/images/Hero.png';
    let imageAlt = pageMetadata ? 'The Tecnoagrarian Logo' : title;
    
    // Use post image if available (check imageList first, then images array)
    if (Array.isArray(post?.imageList) && post.imageList[0] && post.imageList[0].medium) {
        image = `https://www.thetecnoagrarian.com${post.imageList[0].medium}`;
        imageAlt = post.imageList[0].caption || title;
    } else if (Array.isArray(post?.images) && post.images[0] && post.images[0].medium) {
        image = `https://www.thetecnoagrarian.com${post.images[0].medium}`;
        imageAlt = title;
    }
    
    return `
        <meta property="og:title" content="${renderAttribute(title)}" />
        <meta property="og:description" content="${renderAttribute(desc)}" />
        <meta property="og:url" content="${renderAttribute(url)}" />
        <meta property="og:image" content="${image}" />
        <meta property="og:image:alt" content="${renderAttribute(imageAlt)}" />
        <meta property="og:type" content="${post ? 'article' : 'website'}" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@thetecnoagrarian" />
        <meta name="twitter:title" content="${renderAttribute(title)}" />
        <meta name="twitter:description" content="${renderAttribute(desc)}" />
        <meta name="twitter:image" content="${image}" />
    `;
}

export default buildOgTags;
