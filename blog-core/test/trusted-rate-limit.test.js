import assert from 'node:assert/strict';
import test from 'node:test';
import { compileTrustedRateLimitMatcher } from '../src/utils/trusted-rate-limit.js';
import logger from '../src/utils/logger.js';

const accepted = [
    ['IPv4 literal', '192.0.2.8', '192.0.2.8', true],
    ['IPv4 nonmatch', '192.0.2.8', '198.51.100.8', false],
    ['IPv6 literal', '2001:db8::8', '2001:db8::8', true],
    ['IPv6 text remains exact', '2001:db8::8', '2001:0db8:0:0:0:0:0:8', false],
    ['IPv4 mapped text remains distinct', '192.0.2.8', '::ffff:192.0.2.8', false],
    ['whitespace/empty entries', ' , 192.0.2.8, ,2001:db8::8, ', '2001:db8::8', true],
    ['multiple entries', '192.0.2.8,198.51.100.8', '198.51.100.8', true],
    ['duplicates', '192.0.2.8,192.0.2.8', '192.0.2.8', true],
    ['legacy wildcard', '192.0.2.*', '192.0.2.8', true],
    ['legacy wildcard nonmatch', '192.0.2.*', '198.51.100.8', false],
    ['legacy opaque literal', 'SYNTHETIC_OPAQUE_CLIENT', 'SYNTHETIC_OPAQUE_CLIENT', true],
    ['legacy opaque literal nonmatch', 'SYNTHETIC_OPAQUE_CLIENT', '192.0.2.8', false],
    ['legacy regex-bearing wildcard', '192.0.2.*|^198*', '198.51.100.8', true],
    ['legacy literal metacharacters', '[SYNTHETIC_LITERAL]', '[SYNTHETIC_LITERAL]', true],
    ['literal equality before a compiled wildcard', '192.0.2.*', '192.0.2.*', true],
    ['client whitespace is not newly normalized', '192.0.2.8', '192.0.2.8 ', false],
    // Explicit broad patterns remain legacy policy; there is no implicit default.
    ['explicit broad legacy wildcard', '*', '198.51.100.8', true]
];

for (const [name, configuration, client, expected] of accepted) {
    test(`trusted-rate compatibility: ${name}`, () => {
        const matcher = compileTrustedRateLimitMatcher(configuration);
        assert.equal(Boolean(matcher(client)), expected);
        assert.equal(Boolean(matcher(client)), expected, 'Compiled regexes retain stable matching state');
    });
}

for (const [name, configuration] of [['missing', undefined], ['empty', ''], ['whitespace', ' \t '], ['empty entries', ', ,']]) {
    test(`trusted-rate ${name} configuration grants no exemptions`, () => {
        const matcher = compileTrustedRateLimitMatcher(configuration);
        for (const client of ['192.0.2.8', '2001:db8::8', 'SYNTHETIC_OPAQUE_CLIENT', '']) assert.equal(matcher(client), false);
    });
}

const bad = 'SYNTHETIC_PRIVATE_RATE_CONFIGURATION*[';
for (const [name, configuration] of [
    ['malformed only entry', bad],
    ['malformed first', `${bad},192.0.2.8,198.51.100.8`],
    ['malformed middle', `192.0.2.8,${bad},198.51.100.8`],
    ['malformed last', `192.0.2.8,198.51.100.8,${bad}`],
    ['matching wildcard then malformed', `192.0.2.*,${bad}`]
]) {
    test(`trusted-rate whole-list rejection: ${name}`, () => {
        const logs = [], original = logger.error;
        logger.error = (record, message) => logs.push({ ...record, message });
        try {
            const matcher = compileTrustedRateLimitMatcher(configuration);
            for (let i = 0; i < 20; i++) for (const client of ['192.0.2.8', '198.51.100.8', bad]) assert.equal(matcher(client), false);
            assert.equal(logs.length, 1, 'Only initialization emits a rejection diagnostic');
            assert.equal(logs[0].route, 'rate-limit-configuration');
            assert.equal(logs[0].errorName, 'SyntaxError');
            assert.equal(logs[0].message, 'Trusted rate-limit configuration rejected');
            assert.ok(logs[0].errorId);
            assert.equal(JSON.stringify(logs).includes('SYNTHETIC_PRIVATE_RATE_CONFIGURATION'), false);
            assert.equal(logs[0].stack, undefined); assert.equal(logs[0].err, undefined);
        } finally { logger.error = original; }
    });
}
