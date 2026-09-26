function normalizedProfileUrl(value) {
    if (typeof value !== 'string' || value.trim().length === 0) return null;
    try {
        const parsed = new URL(value.trim());
        return ['http:', 'https:'].includes(parsed.protocol) ? value.trim() : null;
    } catch {
        return null;
    }
}

export function buildPublicByline(authors) {
    if (!Array.isArray(authors) || authors.length === 0) return null;

    const normalized = [];
    const positions = new Set();
    for (const [index, author] of authors.entries()) {
        if (!author || typeof author.display_name !== 'string'
            || author.display_name.trim().length === 0
            || !Number.isInteger(author.position)
            || author.position !== index + 1
            || positions.has(author.position)) {
            return null;
        }
        positions.add(author.position);
        normalized.push({
            displayName: author.display_name.trim(),
            profileUrl: normalizedProfileUrl(author.profile_url),
            isArchived: author.is_active === 0,
            prefix: index === 0
                ? ''
                : (index === authors.length - 1
                    ? (authors.length === 2 ? ' and ' : ', and ')
                    : ', ')
        });
    }

    return { authors: normalized };
}
