import { logSafeError } from './error-diagnostics.js';
import { normalizeClientIp } from './client-ip.js';

// Interim compatibility policy: literals and legacy regex-bearing wildcards
// remain accepted. Compilation is neither IP validation nor regex safety review.
export function compileTrustedRateLimitMatcher(configuration) {
    try {
        const entries = (configuration ?? '').split(',').map(entry => entry.trim()).filter(Boolean);
        // Finish the complete compilation before exposing any matching rule.
        const rules = entries.map(literal => ({
            literal: normalizeClientIp(literal) ?? literal,
            regex: literal.includes('*')
                ? new RegExp(`^${literal.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`)
                : null
        }));
        return clientIP => rules.some(rule => clientIP === rule.literal || (rule.regex !== null && rule.regex.test(clientIP)));
    } catch (error) {
        logSafeError(error, { event: 'rate-limit-configuration' });
        return () => false;
    }
}
