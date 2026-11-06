# Nginx Reference Material

Production nginx runs on the host as a systemd-managed service. It is the sole
public ingress and TLS boundary for both sites. The applications remain
published only on host loopback:

- Fruition Forest Garden: `localhost:4000`
- The Tecnoagrarian: `localhost:4002`
- Docker publishes both ports on `127.0.0.1` and `::1`, not wildcard addresses.

Nginx proxies requests to the applications. Express serves repository static
assets and runtime uploads; production does not use a direct nginx `/uploads`
alias. Keeping uploads behind Express is part of the protection for retained
Fruition Forest Garden hero sources under the non-public `.source` path.

Files in this directory are reference or example material unless a future file
explicitly states otherwise. In particular,
`templates/canonical-host-redirects.example.conf` is a sanitized example, not a
copy of live configuration. Repository nginx files are not installed on the
production host automatically.

Certificate paths, private host details, credentials, and the live host
configuration remain outside tracked source. Before any recovery or nginx
change, inspect the live host configuration through a separately authorized,
read-only preflight. Do not infer production state from an example in this
directory.
