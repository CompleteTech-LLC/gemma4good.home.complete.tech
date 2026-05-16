# Promotion

This domain is already using the non-`dev-` home-domain name.

If the workspace becomes an application, promotion means replacing the code-server backend with the final application service while preserving or intentionally migrating the DNS and Caddy route.

## Promotion Checklist

- Current URL is healthy.
- Current route has documented validation results.
- Podman healthcheck reports `healthy`.
- Final application service name and container name are documented.
- Persistent data migration or retention is documented.
- Rollback path is documented before cutover.
