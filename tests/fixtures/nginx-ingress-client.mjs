import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const { tls, host, address, port, pathname, method = 'GET', headers = {}, form, image, reportTransportError } =
    JSON.parse(readFileSync(0, 'utf8'));
let body;
if (form && image) {
    const multipart = new FormData();
    for (const [key, value] of Object.entries(form)) multipart.append(key, value);
    multipart.append('image', new Blob([Buffer.from(image, 'base64')], { type: 'image/png' }), 'synthetic.png');
    const encoded = new Request('https://nginx-gate.test/', { method: 'POST', body: multipart });
    headers['content-type'] = encoded.headers.get('content-type');
    body = Buffer.from(await encoded.arrayBuffer());
} else if (form) {
    body = Buffer.from(new URLSearchParams(form).toString());
    headers['content-type'] = 'application/x-www-form-urlencoded';
}
if (body) headers['content-length'] = String(body.length);

const response = await new Promise((resolve, reject) => {
    const request = (tls ? https : http).request({
        hostname: address, port, path: pathname, method, headers: { host, ...headers }, agent: false,
        ...(tls ? { servername: host, ca: readFileSync('/tmp/nginx-gate.crt') } : {})
    }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => resolve({
            status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('base64')
        }));
    });
    request.on('error', reject);
    request.setTimeout(5000, () => request.destroy(Object.assign(new Error('Synthetic request timed out'), {
        code: 'ETIMEDOUT'
    })));
    request.end(body);
}).catch(error => {
    if (!reportTransportError) throw error;
    return { connectionError: error.code ?? 'UNKNOWN' };
});
process.stdout.write(JSON.stringify(response));
