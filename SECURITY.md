# Security Policy

## 🔒 Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

### How to Report

If you discover a security vulnerability, please send an email to:

📧 **security@example.com**

*(Replace with your actual security contact email or use GitHub Security Advisories)*

### What to Include

- **Type of vulnerability** (e.g., SQL injection, XSS, CSRF)
- **Location** (file path, URL, affected component)
- **Step-by-step reproduction** instructions
- **Proof of concept** code (if applicable)
- **Impact assessment** (what an attacker could do)
- **Suggested fix** (if you have one)

### Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Fix timeline**: Depends on severity (see below)

### Severity Levels

| Severity | Response Time | Examples |
|----------|---------------|----------|
| **Critical** | 24-48 hours | RCE, SQL injection, authentication bypass |
| **High** | 3-7 days | XSS, CSRF, privilege escalation |
| **Medium** | 7-14 days | Information disclosure, DoS |
| **Low** | 14-30 days | Minor issues with limited impact |

## 🛡️ Security Best Practices

### For Deployment

#### 1. Strong Secrets

**Always** change default credentials and secrets:

```bash
# Generate strong JWT secret
openssl rand -hex 32

# In .env file:
JWT_SECRET=your_generated_secret_here  # 32+ characters
POSTGRES_PASSWORD=strong_random_password
ADMIN_PASSWORD=strong_admin_password
```

**Never** commit `.env` files to version control!

#### 2. HTTPS in Production

Always use HTTPS for production deployments:

- Use Let's Encrypt for free SSL certificates
- Configure HSTS headers
- Redirect HTTP to HTTPS

See [INSTALLATION.md](docs/INSTALLATION.md#ssltls-configuration) for setup instructions.

#### 3. CORS Configuration

Restrict CORS to your actual domain:

```bash
# Development
CORS_ORIGIN=http://localhost:3000

# Production
CORS_ORIGIN=https://your-domain.com
```

**Never** use `CORS_ORIGIN=*` in production!

#### 4. Database Security

- **Never** expose PostgreSQL port (5432) to the internet
- Use strong database passwords
- Keep PostgreSQL updated
- Regular backups (see [INSTALLATION.md](docs/INSTALLATION.md#database-backups))

#### 5. Rate Limiting

Rate limiting is enabled by default:

```bash
RATE_LIMIT_WINDOW=15  # minutes
RATE_LIMIT_MAX=100    # requests per window
```

Adjust based on your traffic patterns.

#### 6. Firewall Configuration

Use UFW or similar to restrict access:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

#### 7. Regular Updates

Keep system and dependencies updated:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Docker images
docker-compose pull
docker-compose up -d

# Update Node.js dependencies
cd server-mvp/node-app
npm audit fix
```

### For Development

#### 1. Input Validation

Always validate and sanitize user input:

```javascript
// Good - parameterized query
const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

// BAD - SQL injection vulnerability!
const user = await db.query(`SELECT * FROM users WHERE id = '${userId}'`);
```

#### 2. Password Handling

- **Never** store passwords in plain text
- Use bcrypt for hashing (already configured)
- Minimum 8 characters for user passwords

```javascript
const bcrypt = require('bcryptjs');
const hashedPassword = await bcrypt.hash(password, 10);
```

#### 3. Authentication

- JWT tokens for API authentication
- Refresh tokens in httpOnly cookies
- Token expiration: 1 hour (access), 7 days (refresh)
- Tokens are signed with JWT_SECRET

#### 4. XSS Prevention

- User-generated content is HTML-escaped
- Content-Security-Policy headers configured
- Avoid `innerHTML` with user data

#### 5. CSRF Protection

- API uses JWT tokens (not cookies) for authentication
- State-changing operations require authentication
- Double-submit cookie pattern for forms

## 🔍 Security Features

### Implemented

✅ **Authentication**
- JWT access tokens
- Refresh tokens in httpOnly cookies
- bcrypt password hashing (10 rounds)

✅ **Authorization**
- Role-based access control (admin/user)
- Resource ownership checks
- Protected endpoints require authentication

✅ **Input Validation**
- Parameterized SQL queries (prevents SQL injection)
- Email validation
- Password complexity requirements

✅ **Rate Limiting**
- 100 requests per 15 minutes (default)
- Special limits for login attempts (5 per 15 min)
- Per-IP and per-user rate limiting

✅ **HTTP Security Headers**
- Content-Security-Policy
- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security (HSTS)

✅ **Audit Logging**
- Critical actions logged (login, pool creation, etc.)
- Includes user ID, IP, timestamp, action

✅ **Password Reset**
- Optional email-based password reset
- Time-limited reset tokens
- Rate-limited reset requests

### Not Implemented (Consider Adding)

⚠️ **Two-Factor Authentication (2FA)**
- TOTP-based 2FA
- Backup codes

⚠️ **Session Management**
- Device tracking
- Session invalidation
- "Log out all devices"

⚠️ **Account Lockout**
- Temporary account lock after failed login attempts

⚠️ **Content Security**
- Virus scanning for uploaded images
- File type validation

## 🚨 Known Limitations

### 1. Admin Privileges

Admins can:
- Create/edit/delete any pools
- View audit logs
- Export all data

**Mitigation**: Only give admin role to trusted users.

### 2. File Upload

Image uploads are not restricted by file type or size.

**Mitigation**: Consider adding:
- File type validation (only images)
- Size limits
- Virus scanning

### 3. Public Registration

Anyone can create an account by default.

**Mitigation options**:
- Disable registration (manual account creation only)
- Add email verification
- Use invite codes

### 4. Brute Force

Login rate limiting may not be sufficient for determined attackers.

**Mitigation**: Consider adding:
- Account lockout after X failed attempts
- CAPTCHA for repeated failures
- Fail2Ban integration

## 🛠️ Security Checklist

### Pre-Deployment

- [ ] Changed all default passwords
- [ ] Generated strong JWT_SECRET
- [ ] Configured CORS_ORIGIN to actual domain
- [ ] Enabled HTTPS with valid certificate
- [ ] Configured firewall
- [ ] Reviewed .env for sensitive data
- [ ] Database not exposed to internet
- [ ] Regular backups configured

### Post-Deployment

- [ ] Test HTTPS redirect works
- [ ] Verify security headers present
- [ ] Test rate limiting
- [ ] Check audit logs
- [ ] Monitor for unusual activity
- [ ] Subscribe to security updates

## 📞 Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)
- [Docker Security](https://docs.docker.com/engine/security/)

## 🔄 Security Updates

Security updates are released as soon as possible after a vulnerability is confirmed.

**Subscribe to notifications:**
- Watch this repository on GitHub
- Enable security alerts
- Check release notes regularly

## 📜 Disclosure Policy

When a security issue is fixed:

1. **Private disclosure** to reporter (if applicable)
2. **Fix developed** and tested
3. **Security advisory** published on GitHub
4. **Release** with fix (or hotfix for critical issues)
5. **Public disclosure** 90 days after fix (or sooner if already public)

## ✅ Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | ✅ Yes             |
| < 1.0   | ❌ No              |

## 🙏 Acknowledgments

We thank the security researchers who responsibly disclose vulnerabilities.

Confirmed reporters will be:
- Credited in release notes (if they wish)
- Listed in SECURITY.md
- Thanked publicly (with permission)

---

**Updated**: 2026-02-08

**Contact**: security@example.com *(Replace with your actual contact)*
