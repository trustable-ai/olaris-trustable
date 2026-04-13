create the an file nginx.yaml with a service trustable-svc exposing the ports 4096 5173 and 8910

and an ingress nginx forwarding http and https on the root path to:
Use the Nuvolaris cluster apihost as the base domain.

If the apihost is `http://192.168.1.124.nip.io`, expose:

- `http://trustable.192.168.1.124.nip.io` on port 8910 with `trustable-ing`
- `http://opencode.192.168.1.124.nip.io` on port 4096 with `opencode-ing`
- `http://vite.192.168.1.124.nip.io` on port 5173 with `vite-ing`

If the apihost is `https://bestia.opsv.xyz`, expose the same hosts with `https`
and TLS blocks:

- `https://trustable.bestia.opsv.xyz`
- `https://opencode.bestia.opsv.xyz`
- `https://vite.bestia.opsv.xyz`

`TRUSTABLE_DOMAIN` can override the base domain, while `TRUSTABLE_HOST`,
`OPENCODE_HOST`, and `VITE_HOST` can override individual final hostnames.

write the same also for traefik.yaml with the same ingresses and service but for traefik
