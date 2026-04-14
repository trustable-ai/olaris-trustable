create the an file nginx.yaml with a service trustable-svc exposing the ports 4096 5173 and 8910

and an ingress nginx forwarding http and https on the root path to:
Use the Nuvolaris cluster apihost as the base domain.

If the apihost is `http://<node-ip>.nip.io`, expose:

- `http://trustable.<node-ip>.nip.io` on port 8910 with `trustable-ing`
- `http://opencode.<node-ip>.nip.io` on port 4096 with `opencode-ing`
- `http://vite.<node-ip>.nip.io` on port 5173 with `vite-ing`

If the apihost is `https://<base-domain>`, expose the same hosts with `https`
and TLS blocks:

- `https://trustable.<base-domain>`
- `https://opencode.<base-domain>`
- `https://vite.<base-domain>`

`TRUSTABLE_DOMAIN` can override the base domain, while `TRUSTABLE_HOST`,
`OPENCODE_HOST`, and `VITE_HOST` can override individual final hostnames.

write the same also for traefik.yaml with the same ingresses and service but for traefik
