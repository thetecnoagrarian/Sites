import { isIP, SocketAddress } from 'node:net';

export function normalizeClientIp(address) {
    if (typeof address !== 'string' || address.includes('%')) return undefined;
    const version = isIP(address);
    if (version === 4) return address;
    if (version !== 6) return undefined;

    const canonical = new SocketAddress({ address, family: 'ipv6' }).address;
    // Node renders IPv4-mapped addresses with a dotted-quad suffix.
    const mapped = canonical.startsWith('::ffff:') ? canonical.slice('::ffff:'.length) : '';
    return isIP(mapped) === 4 ? mapped : canonical;
}

export function compileIngressPeerTrust(configuration, required) {
    const peers = configuration?.trim()
        ? configuration.split(',').map(entry => normalizeClientIp(entry.trim())) : [];
    if (peers.includes(undefined) || (required && !peers.length)) {
        const error = new Error('TRUSTED_INGRESS_PEERS requires a comma-separated list of exact IP addresses');
        error.code = 'ERR_TRUSTED_INGRESS_PEERS';
        throw error;
    }

    const trustedPeers = new Set(peers);
    // This callback also gates Express's forwarded protocol and hostname.
    return (address, hop) => hop === 0 && trustedPeers.has(normalizeClientIp(address));
}
