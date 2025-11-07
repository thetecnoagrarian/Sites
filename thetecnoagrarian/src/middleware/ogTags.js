// Default OG tags for the site
const defaultOGTags = `
<meta property="og:url" content="https://www.thetecnoagrarian.com/" />
<meta property="og:image" content="https://www.thetecnoagrarian.com/images/Hero.png" />
<meta property="og:image:alt" content="The Tecnoagrarian Logo" />
<meta property="og:title" content="The Tecnoagrarian" />
<meta property="og:description" content="Exploring the intersection of technology and agriculture" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@thetecnoagrarian" />
<meta name="twitter:title" content="The Tecnoagrarian" />
<meta name="twitter:description" content="Exploring the intersection of technology and agriculture" />
<meta name="twitter:image" content="https://www.thetecnoagrarian.com/images/Hero.png" />
`;

// Generate OG tags for individual posts
function buildOgTags(post) {
    if (!post) return defaultOGTags;
    
    const title = post.title || 'The Tecnoagrarian';
    const desc = post.description || (post.body ? post.body.substring(0, 160).replace(/<[^>]*>/g, '') + '...' : 'Exploring the intersection of technology and agriculture');
    const url = `https://www.thetecnoagrarian.com/post/${post.slug || ''}`;
    
    // Default image
    let image = 'https://www.thetecnoagrarian.com/images/Hero.png';
    let imageAlt = title;
    
    // Use post image if available (check imageList first, then images array)
    if (Array.isArray(post.imageList) && post.imageList[0] && post.imageList[0].medium) {
        image = `https://www.thetecnoagrarian.com${post.imageList[0].medium}`;
        imageAlt = post.imageList[0].caption || title;
    } else if (Array.isArray(post.images) && post.images[0] && post.images[0].medium) {
        image = `https://www.thetecnoagrarian.com${post.images[0].medium}`;
        imageAlt = title;
    }
    
    return `
        <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
        <meta property="og:description" content="${desc.replace(/"/g, '&quot;')}" />
        <meta property="og:url" content="${url}" />
        <meta property="og:image" content="${image}" />
        <meta property="og:image:alt" content="${imageAlt.replace(/"/g, '&quot;')}" />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@thetecnoagrarian" />
        <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
        <meta name="twitter:description" content="${desc.replace(/"/g, '&quot;')}" />
        <meta name="twitter:image" content="${image}" />
    `;
}

export default buildOgTags; 