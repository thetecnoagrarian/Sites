import express from 'express';

// Loaded only into the two disposable containers. Capture the wire headers
// before Express handles them and report the real socket and resolved identity
// on the existing health response. The site's middleware and handlers still run.
const handle = express.application.handle;
express.application.handle = function observeIngress(req, res, next) {
    if (req.method === 'GET' && req.url === '/health') {
        const before = {
            for: req.headers['x-forwarded-for'] ?? null,
            proto: req.headers['x-forwarded-proto'] ?? null,
            host: req.headers['x-forwarded-host'] ?? null,
            forwarded: req.headers.forwarded ?? null,
            realIp: req.headers['x-real-ip'] ?? null
        };
        const writeHead = res.writeHead;
        res.writeHead = function withObservation(...args) {
            const observation = {
                before,
                instance: process.env.NGINX_GATE_INSTANCE,
                upstreamAddress: req.socket.localAddress,
                upstreamPort: req.socket.localPort,
                socketPeer: req.socket.remoteAddress,
                ip: req.ip,
                clientIp: req.clientIp,
                ips: req.ips,
                protocol: req.protocol,
                hostname: req.hostname
            };
            res.setHeader('X-Nginx-Gate-Observation', Buffer.from(JSON.stringify(observation)).toString('base64url'));
            return writeHead.apply(this, args);
        };
    }
    return handle.call(this, req, res, next);
};
