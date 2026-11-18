// Express 4 catches synchronous throws, but does not forward rejected promises.
export const asyncHandler = handler => (req, res, next) =>
    Promise.resolve().then(() => handler(req, res, next)).catch(next);
