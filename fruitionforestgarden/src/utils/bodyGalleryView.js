import sanitizeHtml from 'sanitize-html';
import { randomUUID } from 'node:crypto';

export const GALLERY_MARKER = '<div data-body-gallery></div>';

export function galleryPlacement(body, items, { required = false, preview = false } = {}) {
    if (!required && !items?.length) return null;
    const marker = /^[\t ]*<div data-body-gallery><\/div>[\t ]*(?=\r?$)/gm;
    const matches = [...body.matchAll(marker)];
    if (!items?.length || matches.length !== 1) {
        if (required && (items?.length || matches.length)) {
            throw new Error('Place one documentary gallery marker on its own line outside other elements, or remove it when the gallery is empty.');
        }
        return null;
    }

    // Let the existing HTML tokenizer resolve nesting and raw-text/comment
    // contexts. Render from the original source offsets to preserve prose.
    const match = matches[0];
    const probe = `data-gallery-check-${randomUUID()}`;
    const afterIndex = match.index + match[0].length;
    const checked = body.slice(0, match.index) + `<div data-body-gallery ${probe}></div>` + body.slice(afterIndex);
    let depth = 0;
    const positions = [];
    sanitizeHtml(checked, {
        onOpenTag(name, attributes) {
            if (Object.hasOwn(attributes, 'data-body-gallery')) positions.push({ name, depth, exact: Object.hasOwn(attributes, probe) });
            depth++;
        },
        onCloseTag() { depth--; }
    });
    if (positions.length !== 1 || !positions[0].exact || positions[0].depth !== 0 || positions[0].name !== 'div') {
        if (required) throw new Error('The documentary gallery marker must be outside paragraphs, lists and other elements.');
        return null;
    }

    const prose = preview ? safePreviewProse : value => value;
    return {
        before: prose(body.slice(0, match.index)),
        after: prose(body.slice(afterIndex)),
        items
    };
}

export function safePreviewProse(body) {
    return sanitizeHtml(body, {
        allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
        allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ['src', 'alt', 'title', 'width', 'height'] }
    });
}
