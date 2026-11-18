import { isNativeError } from 'node:util/types';

// Express 4 treats falsy values and routing strings as control flow, not errors.
export const asyncHandler = handler => (req, res, next) => {
    let forwarded = false;
    const forward = (...args) => {
        // Preserve the first explicit next() call, including routing controls.
        // A later callback/rejection must not advance the same handler twice.
        if (forwarded) return;
        forwarded = true;
        return next(...args);
    };
    return Promise.resolve().then(() => handler(req, res, forward)).catch(reason =>
        // The native check does not inspect getters/prototypes, even on proxies.
        forward(isNativeError(reason) ? reason : new Error('Asynchronous handler failed')));
};
