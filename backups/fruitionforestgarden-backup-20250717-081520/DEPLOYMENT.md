# Deployment Guide for Fruition Forest Garden

## 🚨 Deployment Workflow (Always Follow This)

1. **Edit local files** and test your changes.
2. **Commit and push** your changes to GitHub.
3. **Deploy to the live server** at IP: 172.236.119.220 (see details below).

---

## Server Information

- **Provider**: Linode
- **Location**: Chicago, IL
- **Plan**: Nanode 1GB
- **IP Address**: 172.236.119.220
- **IPv6**: 2600:3c06::f03c:95ff:fec6:b681
- **Hostname**: ubuntu-us-ord-ffg
- **Created**: 2025-03-26 01:04
- **Linode ID**: 74194562

## SSH Key Management with 1Password

We use 1Password SSH Agent for secure SSH key management. This provides:
- Secure storage of SSH keys in 1Password
- Automatic key agent functionality
- Integration with system SSH client
- Hardware security module (HSM) support via Secure Enclave
- Automatic locking when system sleeps

### Setup Instructions

1. Store SSH keys in 1Password:
   - Create a new SSH key item in 1Password
   - Store both private and public keys
   - Add relevant tags and notes for organization
   - Enable "Connect with SSH Agent"

2. Configure SSH Agent:
   - Open 1Password > Settings > Developer
   - Enable SSH Agent
   - Allow Terminal/iTerm2 in permissions

3. Configure SSH Client:
   ```bash
   # Create or edit ~/.ssh/config
   Host *
     IdentityAgent "~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"
   ```

4. Security Best Practices:
   - Keep 1Password locked when not in use
   - Use strong Master Password
   - Enable 2FA for 1Password account
   - Regularly audit SSH keys in 1Password
   - Back up emergency kit
   - Never export private keys unless absolutely necessary

5. Troubleshooting:
   - Verify SSH agent is running: `ssh-add -l`
   - Check permissions: `ls -la ~/.ssh/config`
   - Test connection: `ssh -T git@github.com`
   - View debug logs: `ssh -v user@host`

## Initial Server Access

If you're having trouble connecting with SSH, verify these items:

1. Check 1Password SSH Agent status:
   ```bash
   # Should show your keys
   ssh-add -l
   ```

2. Verify SSH config:
   ```bash
   cat ~/.ssh/config
   # Should show 1Password agent configuration
   ```

3. Test SSH connection with verbose output:
   ```bash
   ssh -v root@172.236.119.220
   ```

4. If needed, try connecting with your SSH key explicitly:
   ```bash
   ssh -i ~/.ssh/id_rsa root@172.236.119.220
   ```

5. Verify Linode's SSH configuration:
   - Log into Linode Cloud Manager
   - Check if your SSH key is properly added
   - Consider using Linode's LISH console if SSH is not working

## Linode Server Setup

1. **Create a Linode Instance**
   - Log in to your Linode account
   - Create a new Linode:
     - Distribution: Ubuntu 22.04 LTS
     - Region: Choose closest to your target audience
     - Linode Plan: Shared CPU 2GB (good starting point)
     - Label: fruitionforestgarden-prod
     - Root Password: Set a secure password

2. **Initial Server Setup**
   ```bash
   # SSH into your server
   ssh root@172.236.119.220

   # Update system packages
   apt update && apt upgrade -y

   # Create a non-root user
   adduser deploy
   usermod -aG sudo deploy

   # Set up SSH keys for the new user
   mkdir -p /home/deploy/.ssh
   cp ~/.ssh/authorized_keys /home/deploy/.ssh/
   chown -R deploy:deploy /home/deploy/.ssh
   chmod 700 /home/deploy/.ssh
   chmod 600 /home/deploy/.ssh/authorized_keys

   # Configure SSH
   nano /etc/ssh/sshd_config
   ```

   Update these SSH settings:
   ```
   PermitRootLogin no
   PasswordAuthentication no
   ```

   ```bash
   # Restart SSH service
   systemctl restart sshd
   ```

3. **Install Required Software**
   ```bash
   # Install Node.js 20.x
   curl -fsSL https://deb.nodesource.com/setup_20.x
   sudo apt-get install -y nodejs

   # Install PM2 globally
   sudo npm install -g pm2

   # Install Nginx
   sudo apt install nginx

   # Install other dependencies
   sudo apt install -y git rsync
   ```

4. **Set Up Nginx**
   ```bash
   # Create Nginx configuration
   sudo nano /etc/nginx/sites-available/fruitionforestgarden
   ```

   Add this configuration:
   ```nginx
   server {
       listen 80;
       server_name your_domain.com www.your_domain.com;

       # Redirect HTTP to HTTPS
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name your_domain.com www.your_domain.com;

       ssl_certificate /etc/letsencrypt/live/your_domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/your_domain.com/privkey.pem;
       ssl_session_timeout 1d;
       ssl_session_cache shared:SSL:50m;
       ssl_session_tickets off;
       ssl_protocols TLSv1.2 TLSv1.3;
       ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
       ssl_prefer_server_ciphers off;
       add_header Strict-Transport-Security "max-age=63072000" always;

       client_max_body_size 20M;

       access_log /var/log/nginx/fruitionforestgarden.access.log;
       error_log /var/log/nginx/fruitionforestgarden.error.log;

       root /home/deploy/fruitionforestgarden/src/public;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       # Serve static files directly
       location /uploads/ {
           expires 30d;
           add_header Cache-Control "public, no-transform";
       }

       location /static/ {
           expires 30d;
           add_header Cache-Control "public, no-transform";
       }
   }
   ```

   ```bash
   # Enable the site
   sudo ln -s /etc/nginx/sites-available/fruitionforestgarden /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

5. **Set Up SSL with Let's Encrypt**
   ```bash
   # Install Certbot
   sudo apt install certbot python3-certbot-nginx

   # Get SSL certificate
   sudo certbot --nginx -d your_domain.com -d www.your_domain.com
   ```

## Application Deployment

1. **Prepare Application Directory**
   ```bash
   # As deploy user
   mkdir -p ~/fruitionforestgarden
   mkdir -p ~/backups
   ```

2. **Set Up Environment Variables**
   ```bash
   # Create .env file
   nano ~/fruitionforestgarden/.env
   ```

   Add these variables:
   ```
   NODE_ENV=production
   PORT=3000
   SESSION_SECRET=your-secure-random-string
   LOG_LEVEL=info
   ```

3. **Deploy Application**
   ```bash
   # Clone repository
   git clone https://github.com/yourusername/fruitionforestgarden.git ~/fruitionforestgarden

   # Install dependencies
   cd ~/fruitionforestgarden
   npm install --production

   # Start with PM2
   pm2 start src/app.js --name "fruitionforestgarden"
   pm2 save
   pm2 startup
   ```

4. **Set Up Automatic Backups**
   ```bash
   # Add to crontab
   crontab -e
   ```

   Add this line:
   ```
   0 2 * * * cd /home/deploy/fruitionforestgarden && /usr/bin/npm run backup:auto
   ```

## Monitoring and Maintenance

1. **Monitor Application**
   ```bash
   # View PM2 status
   pm2 status
   pm2 monit

   # View logs
   tail -f ~/fruitionforestgarden/logs/error.log
   tail -f ~/fruitionforestgarden/logs/access.log
   ```

2. **Nginx Logs**
   ```bash
   sudo tail -f /var/log/nginx/fruitionforestgarden.error.log
   sudo tail -f /var/log/nginx/fruitionforestgarden.access.log
   ```

3. **Backup Database**
   ```bash
   # Manual backup
   cd ~/fruitionforestgarden
   npm run backup
   ```

## Updating the Application

1. **Pull Updates**
   ```bash
   cd ~/fruitionforestgarden
   git pull origin main

   # Install any new dependencies
   npm install --production

   # Restart the application
   pm2 restart fruitionforestgarden
   ```

## Security Checklist

- [ ] Set up UFW firewall
- [ ] Configure fail2ban
- [ ] Set up regular security updates
- [ ] Configure backup retention
- [ ] Set up monitoring alerts
- [ ] Review application logs regularly
- [ ] Keep Node.js and npm packages updated
- [ ] Regularly rotate session secrets
- [ ] Monitor disk space usage

## Troubleshooting

1. **If the application crashes:**
   ```bash
   # Check PM2 logs
   pm2 logs fruitionforestgarden

   # Check application logs
   tail -f ~/fruitionforestgarden/logs/error.log
   ```

2. **If Nginx returns 502 Bad Gateway:**
   ```bash
   # Check if Node.js is running
   pm2 status

   # Check Nginx error logs
   sudo tail -f /var/log/nginx/error.log
   ```

3. **If SSL certificate expires:**
   ```bash
   # Renew certificates
   sudo certbot renew
   ``` 