export const META_DESCRIPTION_MAX_LENGTH = 160;

const stripMarkup = (value) => value
    .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

export function normalizeMetaDescription(value, maxLength = META_DESCRIPTION_MAX_LENGTH) {
    if (typeof value !== 'string' || !Number.isSafeInteger(maxLength) || maxLength < 2) {
        return '';
    }

    const normalized = stripMarkup(value).replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }

    const availableLength = maxLength - 1;
    const candidate = normalized.slice(0, availableLength);
    const wordBoundary = candidate.lastIndexOf(' ');
    const cutoff = wordBoundary >= Math.floor(availableLength * 0.75)
        ? wordBoundary
        : availableLength;
    const truncated = candidate
        .slice(0, cutoff)
        .replace(/[\s,;:–—-]+$/u, '');

    return `${truncated}…`;
}

export function getPostMetaDescription(post) {
    for (const value of [post?.description, post?.excerpt, post?.body]) {
        const description = normalizeMetaDescription(value);
        if (description) {
            return description;
        }
    }

    return '';
}

export function getPagedMetaDescription(value, page = 1) {
    const description = normalizeMetaDescription(value);
    if (!description || page <= 1) {
        return description;
    }

    const suffix = ` Page ${page}.`;
    const pagedDescription = normalizeMetaDescription(
        value,
        META_DESCRIPTION_MAX_LENGTH - suffix.length
    );

    return `${pagedDescription}${suffix}`;
}
