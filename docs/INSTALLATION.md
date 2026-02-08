# Installation & Deployment Guide

This guide covers production deployment scenarios for QuizDojo.

## 📋 Table of Contents

- [Production Deployment with Docker](#production-deployment-with-docker)
- [SSL/TLS Configuration](#ssltls-configuration)
- [Custom Domain Setup](#custom-domain-setup)
- [Environment Variables](#environment-variables)
- [Database Backups](#database-backups)
- [Updating the Application](#updating-the-application)
- [Security Hardening](#security-hardening)
- [Monitoring](#monitoring)

---

## 🐳 Production Deployment with Docker

### Prerequisites

- Server running Ubuntu 20.04+ or similar
- Docker and Docker Compose installed
- Domain name pointed to your server's IP
- Ports 80, 443, 5432, 8000 available

### Step 1: Prepare Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Logout and login for group changes to take effect
```

### Step 2: Clone and Configure

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/quizdoji.git
cd quizdoji

# Configure environment
cp server-mvp/.env.example server-mvp/.env
nano server-mvp/.env
```

**Production .env settings:**

```bash
# Database - CHANGE PASSWORD!
POSTGRES_PASSWORD=super_secure_random_password_here

# JWT Secret - Generate with: openssl rand -hex 32
JWT_SECRET=paste_generated_secret_here

# Admin credentials - CHANGE!
ADMIN_EMAIL=your@email.com
ADMIN_PASSWORD=strong_password_here

# CORS - Set to your domain
CORS_ORIGIN=https://your-domain.com

# Optional: Email configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@your-domain.com
SMTP_PASS=smtp_password
```

### Step 3: Deploy

```bash
# Start services in production mode
docker-compose up -d

# Verify all services are running
docker-compose ps

# Check logs
docker-compose logs -f
```

### Step 4: Configure Reverse Proxy

For production, use Nginx or Traefik as a reverse proxy to handle SSL/TLS.

---

## 🔒 SSL/TLS Configuration

### Option 1: Let's Encrypt with Certbot (Recommended)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Stop Nginx container temporarily
docker-compose stop frontend

# Get certificate
sudo certbot certonly --standalone -d your-domain.com

# Certificates will be in /etc/letsencrypt/live/your-domain.com/
```

Update `docker-compose.yml` to mount certificates:

```yaml
frontend:
  image: nginx:alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./site:/usr/share/nginx/html:ro
    - ./nginx-prod.conf:/etc/nginx/conf.d/default.conf:ro
    - /etc/letsencrypt:/etc/letsencrypt:ro
```

Create `nginx-prod.conf`:

```nginx
# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 256;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static assets with cache
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # No cache for index.html
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

**Restart frontend:**

```bash
docker-compose restart frontend
```

### Option 2: Cloudflare SSL

If using Cloudflare:
1. Set DNS to proxy through Cloudflare
2. Enable SSL in Cloudflare dashboard
3. Set SSL mode to "Full (strict)"
4. No Certbot needed

---

## 🌐 Custom Domain Setup

### DNS Configuration

Point your domain to your server:

```
Type  Name              Value               TTL
A     your-domain.com   your.server.ip      3600
A     www               your.server.ip      3600
```

### Update CORS

In `server-mvp/.env`:

```bash
CORS_ORIGIN=https://your-domain.com
```

Restart API:

```bash
docker-compose restart api
```

---

## ⚙️ Environment Variables

Complete reference of environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_USER` | No | pruefungstrainer | PostgreSQL username |
| `POSTGRES_PASSWORD` | **Yes** | - | PostgreSQL password |
| `POSTGRES_DB` | No | pruefungstrainer | Database name |
| `DATABASE_URL` | **Yes** | - | Full PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | - | Secret for signing JWT tokens |
| `JWT_EXPIRES_IN` | No | 1h | Access token expiration |
| `REFRESH_TOKEN_EXPIRES_IN` | No | 7d | Refresh token expiration |
| `ADMIN_EMAIL` | **Yes** | - | Admin user email |
| `ADMIN_PASSWORD` | **Yes** | - | Admin user password |
| `ADMIN_USERNAME` | No | admin | Admin username |
| `CORS_ORIGIN` | **Yes** | - | Allowed frontend origin |
| `API_PORT` | No | 8000 | API server port |
| `FRONTEND_PORT` | No | 3000 | Frontend port |
| `SMTP_HOST` | No | - | SMTP server for emails |
| `SMTP_PORT` | No | 587 | SMTP port |
| `SMTP_USER` | No | - | SMTP username |
| `SMTP_PASS` | No | - | SMTP password |
| `SMTP_FROM` | No | noreply@example.com | From email address |
| `RATE_LIMIT_WINDOW` | No | 15 | Rate limit window (minutes) |
| `RATE_LIMIT_MAX` | No | 100 | Max requests per window |

---

## 💾 Database Backups

### Manual Backup

```bash
# Backup database
docker exec quizdoji_postgres pg_dump -U pruefungstrainer pruefungstrainer > backup_$(date +%Y%m%d_%H%M%S).sql

# Compress backup
gzip backup_*.sql
```

### Automated Backups (Cron)

Create `/usr/local/bin/quizdoji-backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/quizdoji"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
docker exec quizdoji_postgres pg_dump -U pruefungstrainer pruefungstrainer | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete
```

Make executable and add to crontab:

```bash
chmod +x /usr/local/bin/quizdoji-backup.sh

# Run daily at 2 AM
crontab -e
0 2 * * * /usr/local/bin/quizdoji-backup.sh
```

### Restore Backup

```bash
# Decompress
gunzip backup.sql.gz

# Restore
cat backup.sql | docker exec -i quizdoji_postgres psql -U pruefungstrainer -d pruefungstrainer
```

---

## 🔄 Updating the Application

### Step 1: Backup

```bash
# Backup database
docker exec quizdoji_postgres pg_dump -U pruefungstrainer pruefungstrainer > backup_pre_update.sql

# Backup .env
cp server-mvp/.env server-mvp/.env.backup
```

### Step 2: Pull Updates

```bash
cd /path/to/quizdoji
git pull origin main
```

### Step 3: Rebuild and Restart

```bash
# Rebuild API container
docker-compose build api

# Restart all services
docker-compose down
docker-compose up -d

# Check logs for errors
docker-compose logs -f
```

### Step 4: Run Migrations (if any)

Check for database migrations in update notes. If present:

```bash
docker exec -it quizdoji_postgres psql -U pruefungstrainer -d pruefungstrainer -f /path/to/migration.sql
```

---

## 🔐 Security Hardening

### 1. Firewall Configuration

```bash
# Allow SSH, HTTP, HTTPS only
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. Fail2Ban

Protect against brute-force attacks:

```bash
sudo apt install fail2ban

# Create jail for QuizDojo
sudo nano /etc/fail2ban/jail.local
```

Add:

```ini
[quizdoji-api]
enabled = true
port = 8000
filter = quizdoji-api
logpath = /var/log/quizdoji/api.log
maxretry = 5
bantime = 3600
```

### 3. Database Security

- Never expose PostgreSQL port 5432 to public
- Use strong passwords
- Regular updates: `docker-compose pull postgres`

### 4. Regular Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Docker images
docker-compose pull
docker-compose up -d
```

---

## 📊 Monitoring

### Health Checks

Built-in health check endpoint:

```bash
curl https://your-domain.com:8000/health
```

### Docker Health Status

```bash
docker-compose ps
```

### Resource Usage

```bash
docker stats quizdoji_api quizdoji_postgres quizdoji_frontend
```

### Log Monitoring

```bash
# Follow all logs
docker-compose logs -f

# Specific service
docker-compose logs -f api

# Last 100 lines
docker-compose logs --tail=100 api
```

### Optional: Prometheus + Grafana

For advanced monitoring, integrate Prometheus and Grafana:
- Monitor API response times
- Track database connections
- Alert on errors

---

## 🚨 Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs api

# Check if port is in use
sudo lsof -i :8000
```

### Database Connection Issues

```bash
# Test connection
docker exec quizdoji_postgres psql -U pruefungstrainer -d pruefungstrainer -c "SELECT 1;"

# Check DATABASE_URL in .env
```

### SSL Certificate Renewal

Let's Encrypt certificates expire after 90 days. Auto-renew:

```bash
# Test renewal
sudo certbot renew --dry-run

# Add to cron (runs twice daily)
0 0,12 * * * certbot renew --quiet
```

---

## 📞 Support

For deployment issues:
- Check [GitHub Issues](https://github.com/YOUR_USERNAME/quizdoji/issues)
- Read [Architecture Documentation](ARCHITECTURE.md)
- Join [Community Discussions](https://github.com/YOUR_USERNAME/quizdoji/discussions)

---

**Updated**: 2026-02-08
