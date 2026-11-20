import express from 'express';
import { constants, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { MEDIA_ID, checkedMediaPath, managedMediaSegments } from '../utils/private-media.js';

const postUrl = new RegExp(`^/uploads/m1-(${MEDIA_ID})-(thumbnail|medium|large)\\.webp$`);
const heroUrl = new RegExp(`^/uploads/hero/m1-(${MEDIA_ID})/(current-hero(?:-og)?\\.webp)$`);
const deny = res => {
    if (res.headersSent) return res.destroy();
    return res.status(404).set('Cache-Control', 'no-store').type('text/plain').send('Not found');
};

function requestPath(req) {
    const raw = req.url.split('?')[0];
    const decoded = decodeURIComponent(raw);
    if (!decoded.startsWith('/') || /[\\\u0000-\u001f\u007f]/u.test(decoded)
        || /%[0-9a-f]{2}/i.test(decoded) || /%(?:2f|5c)/i.test(raw)
        || decoded.includes('//') || decoded.split('/').some(part => part === '.' || part === '..')) {
        throw new Error('Ambiguous media path');
    }
    return { raw, decoded };
}

async function checkedStaticPath(root, segments) {
    const checked = await checkedMediaPath(root, segments);
    // express.static can implicitly open index.html for a directory request.
    // Validate that alternate lookup as well as the requested path itself.
    if (checked.stat.isDirectory()) {
        try { await checkedMediaPath(root, [...segments, 'index.html']); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return checked;
}

// Both public-tree and upload serving are registered here so tests exercise the
// same order as createBlogApp. Providers must return literal true only for a
// committed publication grant. Absence/error/anything else fails closed.
export function mountMediaServing(app, { publicPath, uploadsPath, privateUploadPathPatterns = [],
    publicationProviders = {}, publicationIntegrityVerifiers = {}, production = process.env.NODE_ENV === 'production' }) {
    const publicStatic = express.static(publicPath, { maxAge: production ? '1h' : 0, immutable: false });
    const uploadsStatic = express.static(uploadsPath, { maxAge: production ? '7d' : 0, immutable: false });
    app.use(async (req, res, next) => {
        try {
            const { raw, decoded } = requestPath(req);
            const parts = decoded.split('/').filter(Boolean);
            // These names are private regardless of mount/prefix/encoding.
            if (parts.some(part => ['.media', '.source'].includes(part.toLowerCase()))) return deny(res);
            const isUpload = parts[0]?.toLowerCase() === 'uploads';
            if (!isUpload) {
                if (!['GET', 'HEAD'].includes(req.method)) return next();
                try { await checkedStaticPath(publicPath, parts); }
                catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return next(); return deny(res); }
                return publicStatic(req, res, next);
            }
            if (parts[0] !== 'uploads' || parts[1]?.toLowerCase() === 'temp'
                || parts.slice(1).some(part => part.startsWith('.'))) return deny(res);
            if (!['GET', 'HEAD'].includes(req.method)) return deny(res);
            const relative = decoded.slice('/uploads'.length);
            if (privateUploadPathPatterns.some(pattern => new RegExp(pattern.source, pattern.flags).test(relative))) return deny(res);
            const reserved = /^\/uploads\/(?:m1-|hero\/m1-)/i.test(decoded);
            if (reserved) {
                // Managed URLs have one canonical, unencoded spelling.
                if (raw !== decoded) return deny(res);
                const post = postUrl.exec(decoded);
                const hero = heroUrl.exec(decoded);
                const match = post || hero;
                if (!match) return deny(res);
                const descriptor = Object.freeze({ kind: post ? 'post' : 'hero', id: match[1], variant: match[2], url: decoded });
                const provider = publicationProviders[descriptor.kind];
                if (typeof provider !== 'function' || await provider(descriptor) !== true) return deny(res);
                const checked = await checkedMediaPath(uploadsPath, managedMediaSegments(descriptor), { singleLink: true });
                const handle = await fs.open(checked.path, constants.O_RDONLY | constants.O_NOFOLLOW);
                try {
                    const stat = await handle.stat({ bigint: true });
                    if (!stat.isFile() || stat.nlink !== 1n || !stat.size
                        || stat.dev !== checked.stat.dev || stat.ino !== checked.stat.ino) return deny(res);
                    const verify = publicationIntegrityVerifiers[descriptor.kind];
                    if (Object.hasOwn(publicationIntegrityVerifiers, descriptor.kind)
                        && (typeof verify !== 'function' || await verify(descriptor, handle, stat) !== true)) return deny(res);
                    // Authorization precedes freshness/304 handling, including HEAD.
                    res.type('image/webp').set({ 'Cache-Control': production ? 'public, max-age=604800' : 'public, max-age=0',
                        'Content-Length': String(stat.size), 'Last-Modified': stat.mtime.toUTCString() });
                    res.set('ETag', `W/"${stat.size.toString(16)}-${stat.mtimeNs.toString(16)}"`);
                    if (req.fresh) return res.status(304).end();
                    if (req.method === 'HEAD') return res.end();
                    await pipeline(handle.createReadStream({ start: 0, autoClose: false }), res);
                } finally { await handle.close(); }
                return;
            }
            // Compatibility only: existing unversioned URLs retain static
            // serving. This is not proof of historical publication or a grant
            // for any new managed candidate.
            const serveUploads = async () => {
                await checkedStaticPath(uploadsPath, parts.slice(1));
                const originalUrl = req.url;
                req.url = (relative || '/').split('/').map(encodeURIComponent).join('/');
                uploadsStatic(req, res, () => {
                    req.url = originalUrl;
                    deny(res); // Never fall through to another static alias.
                });
            };
            try { await checkedStaticPath(publicPath, parts); }
            catch (error) {
                if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') return deny(res);
                await serveUploads();
                return;
            }
            // Preserve the old public-tree-first precedence and its 1h cache;
            // external-volume legacy files retain the separate 7d cache.
            publicStatic(req, res, error => {
                if (error) return deny(res);
                serveUploads().catch(() => deny(res));
            });
        } catch {
            if (res.headersSent) return res.destroy();
            return deny(res);
        }
    });
}
