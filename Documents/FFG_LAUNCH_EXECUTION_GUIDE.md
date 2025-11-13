# Fruition Forest Garden - Launch Execution Guide

**Date**: November 13, 2025  
**Status**: 🚀 **READY TO EXECUTE** - All pre-launch checks complete

---

## ✅ Pre-Launch Status

### Completed ✅
- [x] **Content Review**: All posts reviewed, images verified, hero image working
- [x] **Technical Features**: All features implemented and tested
- [x] **CI/CD Pipeline**: Working as expected
- [x] **Test Domain**: `ffg-new.fruitionforestgarden.com` fully functional
- [x] **Admin Functions**: All working on test domain

### Current Configuration
- **Old Production**: `fruitionforestgarden.com` (old version - needs to be replaced)
- **New Version**: `ffg-new.fruitionforestgarden.com` (test domain - this is what we want to go live)
- **Nginx Config**: `/etc/nginx/sites-available/fruitionforestgarden` (production)
- **Nginx Config**: `/etc/nginx/sites-available/monorepo-test` (test - this is the new version)

---

## 🎯 Launch Objective

**Swap the domains:**
- `fruitionforestgarden.com` (old) → Replace with new version (currently on `ffg-new.fruitionforestgarden.com`)
- `ffg-new.fruitionforestgarden.com` (new) → Can remain as test subdomain or be repurposed

**What this means:**
- The new version (currently on `ffg-new.fruitionforestgarden.com`) will become the production site at `fruitionforestgarden.com`
- The old version at `fruitionforestgarden.com` will be replaced

---

## 📋 Step-by-Step Launch Process

### Step 1: Verify Current Nginx Configuration

**On the server**, check the current Nginx configurations:

```bash
# SSH to server (use values from Documents/SECRETS.md)
ssh [SSH_USER]@[SERVER_IP]

# Check production config (old version)
sudo cat /etc/nginx/sites-available/fruitionforestgarden

# Check test config (new version - this is what we want)
sudo cat /etc/nginx/sites-available/monorepo-test

# Verify which config is active
ls -la /etc/nginx/sites-enabled/ | grep fruition
```

**Expected:**
- `/etc/nginx/sites-available/fruitionforestgarden` → Points to old version (port 3000 or different container)
- `/etc/nginx/sites-available/monorepo-test` → Points to new version (port 4000, `ffg-blog-prod` container)

---

### Step 2: Backup Current Production Config

**Before making changes**, backup the current production config:

```bash
# On server
sudo cp /etc/nginx/sites-available/fruitionforestgarden /etc/nginx/sites-available/fruitionforestgarden.backup.$(date +%Y%m%d)
sudo cp /etc/nginx/sites-enabled/fruitionforestgarden /etc/nginx/sites-enabled/fruitionforestgarden.backup.$(date +%Y%m%d) 2>/dev/null || true
```

---

### Step 3: Update Production Nginx Config

**Replace the production config** with the new version configuration:

```bash
# On server - Check what port the new version uses
sudo grep -A 5 "server_name.*ffg-new" /etc/nginx/sites-available/monorepo-test

# The new version should proxy to localhost:4000 (ffg-blog-prod container)
# Update production config to match
```

**Update `/etc/nginx/sites-available/fruitionforestgarden`:**

The config should proxy to `localhost:4000` (the new container):

```nginx
server {
    listen 80;
    server_name fruitionforestgarden.com www.fruitionforestgarden.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name fruitionforestgarden.com www.fruitionforestgarden.com;
    
    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/fruitionforestgarden.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fruitionforestgarden.com/privkey.pem;
    
    # Proxy to new container (port 4000)
    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://localhost:4000/health;
        access_log off;
    }
}
```

**Or use sed to update just the proxy_pass line:**

```bash
# On server - Update proxy_pass to point to new container
sudo sed -i 's/proxy_pass http:\/\/localhost:[0-9]*;/proxy_pass http:\/\/localhost:4000;/' /etc/nginx/sites-available/fruitionforestgarden

# Verify the change
sudo grep proxy_pass /etc/nginx/sites-available/fruitionforestgarden
```

---

### Step 4: Verify SSL Certificate

**Check that SSL certificate exists and is valid:**

```bash
# On server
sudo certbot certificates | grep fruitionforestgarden

# If certificate doesn't exist or is expired, renew it:
sudo certbot renew --cert-name fruitionforestgarden.com
```

**Expected output:**
- Certificate should exist for `fruitionforestgarden.com`
- Expiry date should be in the future (Let's Encrypt certificates last 90 days)

---

### Step 5: Test Nginx Configuration

**Test the Nginx configuration before reloading:**

```bash
# On server
sudo nginx -t
```

**Expected output:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**If there are errors**, fix them before proceeding.

---

### Step 6: Reload Nginx

**Reload Nginx to apply changes:**

```bash
# On server
sudo systemctl reload nginx

# Verify Nginx is running
sudo systemctl status nginx
```

**Expected:**
- Nginx should reload without errors
- Status should show "active (running)"

---

### Step 7: Verify Container is Running

**Ensure the new container is running:**

```bash
# On server
cd /opt/Sites
docker-compose -f docker-compose.prod.yml ps fruitionforestgarden

# Check container logs
docker logs ffg-blog-prod --tail 20
```

**Expected:**
- Container should be "Up" and healthy
- No errors in logs

---

### Step 8: Test Production Domain

**Test the production domain:**

```bash
# From your local machine
curl -I https://fruitionforestgarden.com

# Should return 200 OK
# Check that it's serving the new version (not the old one)
```

**Browser test:**
1. Visit `https://fruitionforestgarden.com`
2. Verify it shows the new version (check hero image, recent posts, etc.)
3. Test admin login: `https://fruitionforestgarden.com/admin/login`
4. Verify all features work

---

### Step 9: Verify SSL Certificate

**Check SSL certificate in browser:**
1. Visit `https://fruitionforestgarden.com`
2. Click the lock icon in the address bar
3. Verify certificate is valid and issued by Let's Encrypt

**Or use command line:**
```bash
# From your local machine
openssl s_client -connect fruitionforestgarden.com:443 -servername fruitionforestgarden.com < /dev/null 2>/dev/null | openssl x509 -noout -dates
```

---

### Step 10: Monitor for Issues

**Monitor the site for the first hour:**

```bash
# On server - Watch container logs
docker logs -f ffg-blog-prod

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Check Nginx access logs
sudo tail -f /var/log/nginx/access.log
```

**What to watch for:**
- 502 Bad Gateway errors (container not running)
- 503 Service Unavailable (container unhealthy)
- SSL certificate errors
- Rate limiting issues
- Any unexpected errors

---

## 🔄 Rollback Plan (If Needed)

**If something goes wrong**, rollback to the old version:

```bash
# On server
# 1. Restore backup config
sudo cp /etc/nginx/sites-available/fruitionforestgarden.backup.* /etc/nginx/sites-available/fruitionforestgarden
sudo cp /etc/nginx/sites-enabled/fruitionforestgarden.backup.* /etc/nginx/sites-enabled/fruitionforestgarden 2>/dev/null || true

# 2. Test config
sudo nginx -t

# 3. Reload Nginx
sudo systemctl reload nginx
```

---

## ✅ Post-Launch Checklist

After launch, verify:

- [ ] Production domain (`fruitionforestgarden.com`) loads correctly
- [ ] SSL certificate is valid
- [ ] All pages load without errors
- [ ] Admin login works
- [ ] Image uploads work
- [ ] Hero image displays correctly
- [ ] OG tags work (test with Facebook Debugger)
- [ ] No errors in container logs
- [ ] No errors in Nginx logs
- [ ] Analytics tracking works (if configured)

---

## 📝 Notes

- **Test Domain**: `ffg-new.fruitionforestgarden.com` can remain active for testing
- **Container**: The new version runs in `ffg-blog-prod` container on port 4000
- **Database**: Uses volume `ffg_data` - no migration needed
- **Backups**: Automated backups are already configured

---

## 🆘 Troubleshooting

**502 Bad Gateway:**
- Container not running: `docker-compose -f docker-compose.prod.yml up -d fruitionforestgarden`
- Wrong port: Check Nginx config points to port 4000

**SSL Certificate Issues:**
- Renew certificate: `sudo certbot renew --cert-name fruitionforestgarden.com`
- Check certificate path in Nginx config

**Container Health Check Failing:**
- Check container logs: `docker logs ffg-blog-prod`
- Verify health endpoint: `curl http://localhost:4000/health`

---

**Last Updated**: November 13, 2025  
**Ready to Execute**: ✅ Yes - All pre-launch checks complete

