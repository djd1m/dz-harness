---
name: "nginx-config"
description: "Designs and reviews Nginx configurations — reverse proxy, load balancing, SSL/TLS, rate limiting, and security headers."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# nginx-config

Design, review, and harden Nginx configurations for production web infrastructure. Covers reverse proxying, upstream load balancing, SSL/TLS termination with Let's Encrypt, rate limiting, security headers, caching, and performance tuning.

## When to use

- User wants to set up Nginx as a reverse proxy for an application
- User asks for load balancing across multiple backend instances
- User needs SSL/TLS configuration with Let's Encrypt/certbot
- User wants to add security headers (CSP, HSTS, X-Frame-Options)
- User asks about rate limiting or DDoS mitigation at the proxy layer
- User needs Nginx caching configuration for static assets or proxy cache
- User wants to tune Nginx for high concurrency (worker_processes, keepalive, gzip)
- User asks for a review of an existing nginx.conf

## When NOT to use

- User needs a full CDN setup (use a CDN provider, not just Nginx)
- User wants application-level routing logic (that belongs in the app framework)
- User needs HAProxy or Envoy configuration (different proxy, different syntax)
- User wants to build a WAF (use ModSecurity or a dedicated WAF, not raw Nginx)
- User is asking about Apache httpd configuration

## Procedure

### Step 1: Design server blocks

Map each domain or service to a server block. Every server block must declare `server_name` explicitly -- never rely on the default catch-all for production traffic.

**Basic server block structure:**

```nginx
# /etc/nginx/sites-available/app.example.com
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com;

    # Redirect all HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name app.example.com;

    # SSL configuration (Step 3)
    ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

    root /var/www/app.example.com/public;
    index index.html;

    # Proxy to application (Step 4)
    location / {
        proxy_pass http://app_backend;
        include proxy_params;
    }

    # Static assets with caching (Step 7)
    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    access_log /var/log/nginx/app.example.com.access.log;
    error_log  /var/log/nginx/app.example.com.error.log;
}
```

**Catch-all block for unknown hosts:**

```nginx
server {
    listen 80 default_server;
    listen 443 ssl http2 default_server;
    server_name _;

    ssl_certificate     /etc/nginx/ssl/default.pem;
    ssl_certificate_key /etc/nginx/ssl/default-key.pem;

    return 444; # Close connection without response
}
```

### Step 2: Configure upstream backends

Define upstream blocks for load balancing. Choose the appropriate algorithm based on the workload.

**Round-robin (default) -- stateless APIs:**

```nginx
upstream app_backend {
    server 10.0.1.10:3000;
    server 10.0.1.11:3000;
    server 10.0.1.12:3000;

    keepalive 32;  # Connection pooling to backends
}
```

**Least connections -- variable request durations:**

```nginx
upstream api_backend {
    least_conn;
    server 10.0.1.10:8080 weight=3;  # More powerful machine
    server 10.0.1.11:8080 weight=1;
    server 10.0.1.12:8080 weight=1 backup;  # Only when others are down
}
```

**IP hash -- session affinity:**

```nginx
upstream websocket_backend {
    ip_hash;
    server 10.0.1.10:8080;
    server 10.0.1.11:8080;
    server 10.0.1.12:8080 down;  # Temporarily removed
}
```

**Health checks with passive detection:**

```nginx
upstream app_backend {
    server 10.0.1.10:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.11:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:3000 max_fails=3 fail_timeout=30s;

    keepalive 32;
    keepalive_timeout 60s;
    keepalive_requests 1000;
}
```

### Step 3: SSL/TLS with Let's Encrypt and certbot

Set up automated certificate management. Always use modern TLS settings.

**Initial certificate issuance:**

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate (Nginx plugin handles validation automatically)
sudo certbot --nginx -d app.example.com -d www.app.example.com

# Verify auto-renewal
sudo certbot renew --dry-run

# Cron for renewal (certbot installs this automatically, but verify)
# /etc/cron.d/certbot
0 */12 * * * root certbot renew --quiet --deploy-hook "systemctl reload nginx"
```

**Modern SSL configuration:**

```nginx
# /etc/nginx/snippets/ssl-params.conf
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;

ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;

# OCSP stapling
ssl_stapling on;
ssl_stapling_verify on;
resolver 1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout 5s;

# Diffie-Hellman parameter
ssl_dhparam /etc/nginx/dhparam.pem;
```

**Generate DH parameters:**

```bash
sudo openssl dhparam -out /etc/nginx/dhparam.pem 2048
```

### Step 4: Configure proxy_pass

Forward requests to upstream backends with proper header propagation.

**Standard reverse proxy:**

```nginx
location / {
    proxy_pass http://app_backend;
    proxy_http_version 1.1;

    # Pass client information to backend
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID      $request_id;

    # Timeouts
    proxy_connect_timeout 5s;
    proxy_send_timeout    60s;
    proxy_read_timeout    60s;

    # Buffering
    proxy_buffering on;
    proxy_buffer_size 4k;
    proxy_buffers 8 4k;
}
```

**WebSocket proxying:**

```nginx
location /ws/ {
    proxy_pass http://websocket_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host       $host;
    proxy_read_timeout 86400s;  # 24h for long-lived connections
    proxy_send_timeout 86400s;
}
```

**API with path rewriting:**

```nginx
location /api/v1/ {
    proxy_pass http://api_backend/;  # Trailing slash strips /api/v1/ prefix
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;

    # API-specific timeouts
    proxy_read_timeout 30s;
    proxy_connect_timeout 5s;
}
```

### Step 5: Rate limiting

Protect against abuse with zone-based rate limiting. Use multiple zones for different endpoint sensitivities.

**Rate limit configuration:**

```nginx
# /etc/nginx/conf.d/rate-limiting.conf

# Global: 10 requests/second per IP
limit_req_zone $binary_remote_addr zone=global:10m rate=10r/s;

# API: 30 requests/second per IP
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

# Login: 5 requests/minute per IP (brute force protection)
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

# Per-user rate limiting (requires auth header extraction)
map $http_authorization $api_user {
    default        $binary_remote_addr;
    "~Bearer (.+)" $1;
}
limit_req_zone $api_user zone=per_user:10m rate=100r/m;
```

**Applying rate limits:**

```nginx
server {
    # Global rate limit with burst
    location / {
        limit_req zone=global burst=20 nodelay;
        limit_req_status 429;
        proxy_pass http://app_backend;
    }

    # Strict rate limit on authentication
    location /auth/login {
        limit_req zone=login burst=3 nodelay;
        limit_req_status 429;
        proxy_pass http://app_backend;
    }

    # API with per-user limits
    location /api/ {
        limit_req zone=api burst=50 nodelay;
        limit_req zone=per_user burst=20;
        limit_req_status 429;
        proxy_pass http://api_backend;
    }

    # Custom 429 page
    error_page 429 /429.html;
    location = /429.html {
        root /var/www/error-pages;
        internal;
    }
}
```

### Step 6: Security headers

Add defense-in-depth headers to every response. These prevent XSS, clickjacking, MIME sniffing, and other client-side attacks.

**Security headers snippet:**

```nginx
# /etc/nginx/snippets/security-headers.conf

# Strict Transport Security -- enforce HTTPS for 1 year, include subdomains
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

# Content Security Policy -- restrict resource origins
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.example.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.example.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" always;

# Prevent clickjacking
add_header X-Frame-Options "DENY" always;

# Prevent MIME type sniffing
add_header X-Content-Type-Options "nosniff" always;

# Control referrer information
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Permissions Policy -- disable unnecessary browser features
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;

# Remove server version
server_tokens off;
```

**Including in server blocks:**

```nginx
server {
    listen 443 ssl http2;
    server_name app.example.com;

    include snippets/ssl-params.conf;
    include snippets/security-headers.conf;

    # Hide upstream technology headers
    proxy_hide_header X-Powered-By;
    proxy_hide_header Server;

    location / {
        proxy_pass http://app_backend;
    }
}
```

### Step 7: Caching

Configure caching at multiple layers: static files, proxy cache, and microcaching for dynamic content.

**Static asset caching:**

```nginx
# Long-lived cache for fingerprinted assets
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|woff|ttf)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    add_header Vary "Accept-Encoding";
    access_log off;

    # Serve pre-compressed files if available
    gzip_static on;
    brotli_static on;  # Requires ngx_brotli module
}

# Short cache for HTML
location ~* \.html$ {
    expires 1h;
    add_header Cache-Control "public, must-revalidate";
}
```

**Proxy cache for API responses:**

```nginx
# Define cache zone
proxy_cache_path /var/cache/nginx/api levels=1:2 keys_zone=api_cache:10m
                 max_size=1g inactive=60m use_temp_path=off;

server {
    location /api/ {
        proxy_pass http://api_backend;
        proxy_cache api_cache;
        proxy_cache_valid 200 5m;
        proxy_cache_valid 404 1m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503;
        proxy_cache_lock on;
        proxy_cache_lock_timeout 5s;

        add_header X-Cache-Status $upstream_cache_status;

        # Bypass cache for authenticated requests
        proxy_cache_bypass $http_authorization;
        proxy_no_cache $http_authorization;
    }
}
```

**Microcaching for dynamic pages (1 second):**

```nginx
proxy_cache_path /var/cache/nginx/micro levels=1:2 keys_zone=micro_cache:5m
                 max_size=500m inactive=10m;

location / {
    proxy_pass http://app_backend;
    proxy_cache micro_cache;
    proxy_cache_valid 200 1s;
    proxy_cache_lock on;

    # Never cache POST, PUT, DELETE
    proxy_cache_methods GET HEAD;
    proxy_no_cache $request_method;
}
```

### Step 8: Performance tuning

Tune Nginx for high concurrency and throughput.

**Main context tuning (`/etc/nginx/nginx.conf`):**

```nginx
# Auto-detect CPU cores
worker_processes auto;

# Maximum open files per worker (must match ulimit -n)
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;   # Per worker (total = workers * connections)
    multi_accept on;           # Accept all pending connections at once
    use epoll;                 # Linux: use epoll for event multiplexing
}

http {
    # Connection keepalive
    keepalive_timeout 65;
    keepalive_requests 1000;

    # Request parsing
    client_max_body_size 10m;     # Reject oversized uploads early
    client_body_timeout 12s;
    client_header_timeout 12s;
    send_timeout 10s;

    # Buffer tuning
    client_body_buffer_size 16k;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 8k;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 4;           # Balance CPU vs compression ratio
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/xml
        image/svg+xml
        application/wasm;

    # File handling
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;

    # Logging
    access_log /var/log/nginx/access.log combined buffer=512k flush=5s;
    error_log /var/log/nginx/error.log warn;

    # Open file cache
    open_file_cache max=10000 inactive=20s;
    open_file_cache_valid 30s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

**System-level tuning (sysctl):**

```bash
# /etc/sysctl.d/99-nginx.conf
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 1024 65535
```

## Anti-patterns

| Anti-pattern | Why it is wrong | Fix |
|---|---|---|
| No SSL / HTTP only | All traffic is plaintext; MITM attacks trivial | Always use HTTPS with Let's Encrypt (free) |
| Open proxy (no `server_name`) | Anyone can use your server as a proxy | Always set explicit `server_name`; add catch-all block returning 444 |
| `client_max_body_size 0` or very large | Allows unbounded uploads, enables DoS | Set to the minimum your app needs (e.g., 10m) |
| Using `latest` TLS config from 2015 | SSLv3/TLSv1.0/TLSv1.1 are broken | Use TLSv1.2+ only, modern cipher suites |
| No rate limiting on login/auth | Brute force attacks go unchecked | Add `limit_req_zone` with strict limits on auth endpoints |
| `proxy_pass` without `Host` header | Backend cannot determine the original host | Always set `proxy_set_header Host $host` |
| Missing `X-Forwarded-For` | Backend cannot see real client IP | Always pass `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` |
| No security headers | XSS, clickjacking, MIME sniffing attacks | Include the security-headers snippet in every server block |
| `server_tokens on` (default) | Exposes Nginx version to attackers | Set `server_tokens off` in http block |
| No upstream keepalive | New TCP connection per request to backend | Add `keepalive 32` to upstream blocks |

## Self-check

Before completing, verify all 10 items:

1. Every server block has an explicit `server_name` (no wildcard catch-all serving real traffic)
2. HTTP redirects to HTTPS with 301 (no plaintext serving)
3. SSL uses TLSv1.2+ with modern ciphers and OCSP stapling
4. All security headers present: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
5. Rate limiting configured on at least authentication endpoints
6. `proxy_set_header` includes Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto
7. `client_max_body_size` is set to a reasonable value (not 0 or unbounded)
8. `server_tokens off` is set
9. Upstream blocks use `keepalive` for connection pooling
10. Gzip enabled with appropriate MIME types
