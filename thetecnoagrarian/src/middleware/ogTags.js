// Default OG tags for the site
const defaultOGTags = `
<meta property="og:url" content="https://www.thetecnoagrarian.com/" />
<meta property="og:image" content="https://www.thetecnoagrarian.com/images/HeroCamp.png" />
<meta property="og:title" content="The Tecnoagrarian" />
<meta property="og:description" content="Exploring the intersection of technology and agriculture" />
<meta property="og:type" content="website" />
`;

// Generate OG tags for individual posts
const generatePostOGTags = (post) => {
    if (!post) return defaultOGTags;
    
    const title = post.title || 'The Tecnoagrarian';
    const desc = post.excerpt || (post.content ? post.content.substring(0, 160) + '...' : 'Exploring the intersection of technology and agriculture');
    const url = `https://www.thetecnoagrarian.com/post/${post.slug || ''}`;
    
    // Default image
    let image = 'https://www.thetecnoagrarian.com/images/HeroCamp.png?debug=1';
    
    // Use post image if available
    if (post.images && post.images.length > 0) {
        image = `https://www.thetecnoagrarian.com${post.images[0].medium}?debug=1`;
    }
    
    return `
        <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
        <meta property="og:description" content="${desc.replace(/"/g, '&quot;')}" />
        <meta property="og:url" content="${url}" />
        <meta property="og:image" content="${image}" />
        <meta property="og:type" content="article" />
    `;
};

export default generatePostOGTags; 