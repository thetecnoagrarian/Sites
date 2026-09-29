const reviewedStates = new Set(['verified', 'owner_attested']);
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const exactTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function nonemptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function validCalendarDate(value) {
    if (!nonemptyString(value) || !dateOnlyPattern.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

function validExactTimestamp(value) {
    return nonemptyString(value)
        && exactTimestampPattern.test(value)
        && !Number.isNaN(Date.parse(value))
        && validCalendarDate(value.slice(0, 10));
}

function normalizedWebUrl(value) {
    if (!nonemptyString(value)) return null;
    const normalized = value.trim();
    try {
        const parsed = new URL(normalized);
        if (!['http:', 'https:'].includes(parsed.protocol)
            || parsed.username || parsed.password) return null;
        return normalized;
    } catch {
        return null;
    }
}

function person(value) {
    const name = value?.display_name ?? value?.displayName ?? value?.name;
    if (!nonemptyString(name)) return null;
    const result = { '@type': 'Person', name: name.trim() };
    const profileUrl = normalizedWebUrl(
        value?.profile_url ?? value?.profileUrl ?? value?.url);
    if (profileUrl) result.url = profileUrl;
    return result;
}

function reviewedAuthors(state, authors) {
    if (!reviewedStates.has(state) || !Array.isArray(authors) || authors.length === 0) {
        return null;
    }
    const normalized = [];
    for (const [index, author] of authors.entries()) {
        if (author?.position !== undefined && author.position !== index + 1) return null;
        const normalizedPerson = person(author);
        if (!normalizedPerson) return null;
        normalized.push(normalizedPerson);
    }
    return normalized;
}

function reviewedPublication(publication) {
    if (!publication || typeof publication !== 'object') return null;
    const { state, publishedOn, publishedAt } = publication;
    if (!reviewedStates.has(state)) return null;
    const hasDate = publishedOn !== undefined && publishedOn !== null && publishedOn !== '';
    const hasExact = publishedAt !== undefined && publishedAt !== null && publishedAt !== '';
    if (hasDate === hasExact) return null;
    if (hasDate) return validCalendarDate(publishedOn) ? publishedOn : null;
    return validExactTimestamp(publishedAt) ? publishedAt : null;
}

export function resolveAbsoluteWebUrl(value, baseUrl) {
    if (!nonemptyString(value)) return null;
    try {
        const resolved = new URL(value.trim(), baseUrl);
        if (!['http:', 'https:'].includes(resolved.protocol)
            || resolved.username || resolved.password) return null;
        return resolved.href;
    } catch {
        return null;
    }
}

export function buildBlogPostingJsonLd({
    headline,
    description,
    canonicalUrl,
    imageUrl,
    authors,
    authorshipReviewState,
    publisher,
    publication
} = {}) {
    if (!nonemptyString(headline)) return null;
    const url = normalizedWebUrl(canonicalUrl);
    if (!url) return null;

    const result = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline,
        url,
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': url
        }
    };
    if (nonemptyString(description)) result.description = description;
    const image = normalizedWebUrl(imageUrl);
    if (image) result.image = image;
    const normalizedAuthors = reviewedAuthors(authorshipReviewState, authors);
    if (normalizedAuthors) result.author = normalizedAuthors;
    const normalizedPublisher = person(publisher);
    if (normalizedPublisher) result.publisher = normalizedPublisher;
    const datePublished = reviewedPublication(publication);
    if (datePublished) result.datePublished = datePublished;
    return result;
}

const scriptEscape = Object.freeze({
    '<': '\\u003C',
    '>': '\\u003E',
    '&': '\\u0026',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029'
});

export function serializeJsonLd(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => scriptEscape[character]);
}
