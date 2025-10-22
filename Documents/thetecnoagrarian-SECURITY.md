# 🔒 Security Guidelines

## Pre-Deployment Security Checklist

### ✅ Environment Variables
- [ ] `SESSION_SECRET` - Use a strong, random string (32+ characters)
- [ ] `CSRF_SECRET` - Use a strong, random string (32+ characters)  
- [ ] `ADMIN_PASSWORD` - Change from default `admin123`
- [ ] `NODE_ENV=production` - Set in production

### ✅ Database Security
- [ ] Database file permissions set to 600 (owner read/write only)
- [ ] Database file location is secure and not publicly accessible
- [ ] Regular backups with encryption
- [ ] Database file excluded from version control

### ✅ File Upload Security
- [ ] File upload directory permissions set correctly
- [ ] File type validation implemented
- [ ] File size limits enforced
- [ ] Upload directory not publicly accessible

### ✅ Server Security
- [ ] HTTPS enabled in production
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] CSRF protection enabled
- [ ] Session security configured

### ✅ Access Control
- [ ] Admin password changed from default
- [ ] User roles properly configured
- [ ] Authentication middleware active
- [ ] Authorization checks implemented

## Security Commands

### Generate Secure Secrets
```bash
# Generate session secret
openssl rand -hex 32

# Generate CSRF secret  
openssl rand -hex 32

# Generate admin password
openssl rand -base64 12
```

### Set File Permissions
```bash
# Database file
chmod 600 src/database/*.db

# Upload directory
chmod 755 src/public/uploads
chmod 644 src/public/uploads/*

# Environment file
chmod 600 .env
```

## Security Warnings

⚠️ **NEVER commit these files:**
- `.env` files
- Database files (`*.db`)
- SSH keys
- Log files
- Upload directories

⚠️ **ALWAYS change default passwords before production deployment**

⚠️ **Use HTTPS in production environments**

## Monitoring

- Monitor access logs for suspicious activity
- Regular security audits
- Keep dependencies updated
- Monitor for security advisories
