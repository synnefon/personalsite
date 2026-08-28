# oura-proxy

The oura api ("Disallowed CORS origin") refuses browser calls from every
origin — registering an oauth app does not whitelist you. This worker is
the smallest possible workaround: the /oura-hr page calls it instead of
api.ouraring.com, and it forwards the request (Authorization header only)
and returns the response with CORS headers for the site's origins.

## Deploy (one time, free Cloudflare account)

```sh
cd oura-proxy
npx wrangler login    # opens a browser
npx wrangler deploy   # prints the worker url
```

Paste the printed url (e.g. `https://oura-proxy.<subdomain>.workers.dev`)
into the "api proxy url" field on the /oura-hr page. It's kept in
localStorage, so this is per-browser, no site redeploy needed.

## Test locally

```sh
npx wrangler dev      # serves on localhost:8787, no login needed
curl -i 'http://localhost:8787/v2/usercollection/heartrate' \
  -H 'Origin: https://connorhopkins.xyz' -H 'Authorization: Bearer x'
# expect oura's 401 json + access-control-allow-origin header
```

## Scope

GET only, `/v2/(sandbox/)usercollection/*` only, allowed origins are
hardcoded in worker.js (the site + localhost:3000). It sees bearer tokens
in transit but stores and logs nothing.
