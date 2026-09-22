import { getDatabase } from './db.js';

const publicKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizedRequiredText(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TypeError(`${field} must be a non-empty string`);
    }
    return value.trim();
}

function normalizedProfileUrl(value) {
    if (value === undefined || value === null || value === '') return null;
    const normalized = normalizedRequiredText(value, 'profileUrl');
    let parsed;
    try {
        parsed = new URL(normalized);
    } catch {
        throw new TypeError('profileUrl must be an absolute HTTP or HTTPS URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new TypeError('profileUrl must be an absolute HTTP or HTTPS URL');
    }
    return normalized;
}

class PublicPerson {
    static create({ publicKey, displayName, profileUrl = null }) {
        const key = normalizedRequiredText(publicKey, 'publicKey');
        if (!publicKeyPattern.test(key)) {
            throw new TypeError('publicKey must be a lowercase, hyphen-separated stable key');
        }
        const name = normalizedRequiredText(displayName, 'displayName');
        const db = getDatabase();
        const result = db.prepare(`
            INSERT INTO public_people (public_key, display_name, profile_url)
            VALUES (?, ?, ?)
        `).run(key, name, normalizedProfileUrl(profileUrl));
        return PublicPerson.findById(result.lastInsertRowid);
    }

    static findById(id) {
        return getDatabase().prepare('SELECT * FROM public_people WHERE id = ?').get(id);
    }

    static findByKey(publicKey) {
        return getDatabase().prepare('SELECT * FROM public_people WHERE public_key = ?')
            .get(publicKey);
    }

    static list({ includeArchived = false } = {}) {
        const where = includeArchived ? '' : 'WHERE is_active = 1';
        return getDatabase().prepare(`
            SELECT * FROM public_people
            ${where}
            ORDER BY display_name COLLATE NOCASE, id
        `).all();
    }

    static archive(id) {
        const result = getDatabase().prepare(`
            UPDATE public_people
            SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND is_active = 1
        `).run(id);
        return result.changes === 1;
    }

    static updateProfile(id, { displayName, profileUrl = null }) {
        const name = normalizedRequiredText(displayName, 'displayName');
        const result = getDatabase().prepare(`
            UPDATE public_people
            SET display_name = ?, profile_url = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, normalizedProfileUrl(profileUrl), id);
        if (result.changes !== 1) throw new Error(`Public Person ${id} does not exist`);
        return PublicPerson.findById(id);
    }

    static unarchive(id) {
        const result = getDatabase().prepare(`
            UPDATE public_people
            SET is_active = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND is_active = 0
        `).run(id);
        return result.changes === 1;
    }
}

export default PublicPerson;
