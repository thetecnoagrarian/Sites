import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
    formatCalendarDate,
    getPublicPublicationDisplay
} from '../src/utils/publicPublicationDisplay.js';

const reviewedDate = (overrides = {}) => ({
    publication_review_state: 'verified',
    published_on: '2026-02-01',
    published_at: null,
    ...overrides
});

test('reviewed date-only publication displays only beyond the 30-day boundary', () => {
    assert.deepEqual(
        getPublicPublicationDisplay('2026-01-01', reviewedDate()),
        { date: '2026-02-01', formattedDate: 'February 1, 2026' }
    );
    assert.deepEqual(
        getPublicPublicationDisplay('2026-01-01 12:00:00', reviewedDate({
            publication_review_state: 'owner_attested'
        })),
        { date: '2026-02-01', formattedDate: 'February 1, 2026' }
    );
    assert.equal(getPublicPublicationDisplay('2026-01-02', reviewedDate()), null,
        'exactly 30 calendar days later is hidden');
    assert.equal(getPublicPublicationDisplay('2026-02-01', reviewedDate()), null,
        'same-day publication is hidden');
    assert.equal(getPublicPublicationDisplay('2026-02-02', reviewedDate()), null,
        'publication before Event Date is hidden');
});

test('unreviewed, unavailable, missing, and contradictory facts are hidden', () => {
    assert.equal(getPublicPublicationDisplay('2026-01-01', null), null);
    assert.equal(getPublicPublicationDisplay('2026-01-01', 'missing'), null);

    assert.equal(getPublicPublicationDisplay('2026-01-01', reviewedDate({
        publication_review_state: 'unreviewed'
    })), null);
    assert.equal(getPublicPublicationDisplay('2026-01-01', reviewedDate({
        publication_review_state: 'reviewed_unavailable'
    })), null);
    assert.equal(getPublicPublicationDisplay('2026-01-01', reviewedDate({
        publication_review_state: undefined
    })), null);
    assert.equal(getPublicPublicationDisplay('2026-01-01', reviewedDate({
        publication_review_state: 'approved'
    })), null);
    assert.equal(getPublicPublicationDisplay('2026-01-01', reviewedDate({
        published_on: null
    })), null);
    assert.equal(getPublicPublicationDisplay('2026-01-01', reviewedDate({
        published_at: '2026-02-01T12:00:00Z'
    })), null);
});

test('invalid Event and publication values are hidden', () => {
    assert.equal(getPublicPublicationDisplay('2026-02-30', reviewedDate()), null);
    assert.equal(getPublicPublicationDisplay('not-a-date', reviewedDate()), null);
    assert.equal(getPublicPublicationDisplay('2026-01-01', reviewedDate({
        published_on: '2026-02-30'
    })), null);
    assert.equal(getPublicPublicationDisplay('2026-01-01', reviewedDate({
        published_on: null,
        published_at: '2026-02-01T12:00:00'
    })), null, 'exact timestamp requires an explicit offset');
});

test('exact timestamp uses the calendar day written in its explicit offset', () => {
    assert.deepEqual(getPublicPublicationDisplay('2026-01-01', reviewedDate({
        published_on: null,
        published_at: '2026-02-01T00:30:00+14:00'
    })), {
        date: '2026-02-01',
        formattedDate: 'February 1, 2026'
    });
    assert.equal(getPublicPublicationDisplay('2026-01-02', reviewedDate({
        published_on: null,
        published_at: '2026-02-01T23:30:00-10:00'
    })), null, 'the written February 1 date is exactly 30 days after January 2');
});

test('date-only formatting is invariant across runtime timezones', () => {
    const moduleUrl = new URL('../src/utils/publicPublicationDisplay.js', import.meta.url).href;
    const script = `import { formatCalendarDate } from ${JSON.stringify(moduleUrl)}; process.stdout.write(formatCalendarDate('2026-02-01'));`;
    for (const timezone of ['Pacific/Honolulu', 'UTC', 'Pacific/Kiritimati']) {
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
            encoding: 'utf8',
            env: { ...process.env, TZ: timezone }
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, 'February 1, 2026');
    }
    assert.equal(formatCalendarDate('2026-02-30'), null);
});
