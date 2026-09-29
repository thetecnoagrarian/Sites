const REVIEWED_PUBLICATION_STATES = new Set(['verified', 'owner_attested']);
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const EVENT_DATETIME_PATTERN = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
const EXACT_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function parseCalendarDate(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(CALENDAR_DATE_PATTERN);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    if (utcDate.getUTCFullYear() !== year
        || utcDate.getUTCMonth() !== month - 1
        || utcDate.getUTCDate() !== day) {
        return null;
    }

    return { value, year, month, day, dayNumber: Date.UTC(year, month - 1, day) / 86400000 };
}

function validTime(hourText, minuteText, secondText) {
    return Number(hourText) <= 23
        && Number(minuteText) <= 59
        && Number(secondText) <= 59;
}

function validOffset(value) {
    if (!value || value === 'Z') return true;
    return Number(value.slice(1, 3)) <= 23 && Number(value.slice(4, 6)) <= 59;
}

function eventCalendarDate(value) {
    if (typeof value !== 'string') return null;
    const dateOnly = parseCalendarDate(value);
    if (dateOnly) return dateOnly;

    const match = value.match(EVENT_DATETIME_PATTERN);
    if (!match || !validTime(match[2], match[3], match[4]) || !validOffset(match[5])) {
        return null;
    }
    return parseCalendarDate(match[1]);
}

function exactPublicationCalendarDate(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(EXACT_TIMESTAMP_PATTERN);
    if (!match || !validTime(match[2], match[3], match[4])) return null;

    if (!validOffset(match[5])) return null;

    if (Number.isNaN(Date.parse(value))) return null;
    return parseCalendarDate(match[1]);
}

export function formatCalendarDate(value) {
    const parsed = parseCalendarDate(value);
    if (!parsed) return null;
    return `${MONTHS[parsed.month - 1]} ${parsed.day}, ${parsed.year}`;
}

export function getPublicPublicationDisplay(eventDate, publicationFacts = {}) {
    if (!publicationFacts || typeof publicationFacts !== 'object') return null;

    if (!REVIEWED_PUBLICATION_STATES.has(publicationFacts.publication_review_state)) {
        return null;
    }

    const hasDateOnly = publicationFacts.published_on !== null
        && publicationFacts.published_on !== undefined
        && publicationFacts.published_on !== '';
    const hasExact = publicationFacts.published_at !== null
        && publicationFacts.published_at !== undefined
        && publicationFacts.published_at !== '';
    if (hasDateOnly === hasExact) return null;

    const event = eventCalendarDate(eventDate);
    const publication = hasDateOnly
        ? parseCalendarDate(publicationFacts.published_on)
        : exactPublicationCalendarDate(publicationFacts.published_at);
    if (!event || !publication || publication.dayNumber - event.dayNumber <= 30) {
        return null;
    }

    return {
        date: publication.value,
        formattedDate: formatCalendarDate(publication.value)
    };
}
