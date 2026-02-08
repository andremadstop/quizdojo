#!/bin/bash
# QuizDojo - Automatisches Installations-Script
# Erstellt die .env Datei mit sicheren Credentials

set -e

echo "╔═══════════════════════════════════════╗"
echo "║   QuizDojo - Installation Script     ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Prüfe ob Docker installiert ist
if ! command -v docker &> /dev/null; then
    echo "❌ Docker ist nicht installiert!"
    echo ""
    echo "Installation:"
    echo "  curl -fsSL https://get.docker.com | sh"
    echo ""
    exit 1
fi

# Prüfe ob .env bereits existiert
if [ -f "server-mvp/.env" ]; then
    echo "⚠️  .env Datei existiert bereits!"
    read -p "Überschreiben? (j/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Jj]$ ]]; then
        echo "Installation abgebrochen."
        exit 0
    fi
fi

echo "📝 Konfiguration"
echo ""

# Admin Email
read -p "Admin E-Mail: " ADMIN_EMAIL
while [[ ! "$ADMIN_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; do
    echo "❌ Ungültige E-Mail!"
    read -p "Admin E-Mail: " ADMIN_EMAIL
done

# Admin Passwort
read -s -p "Admin Passwort (min. 8 Zeichen): " ADMIN_PASSWORD
echo ""
while [ ${#ADMIN_PASSWORD} -lt 8 ]; do
    echo "❌ Passwort zu kurz! Mindestens 8 Zeichen."
    read -s -p "Admin Passwort (min. 8 Zeichen): " ADMIN_PASSWORD
    echo ""
done

# Passwort bestätigen
read -s -p "Passwort wiederholen: " ADMIN_PASSWORD_CONFIRM
echo ""
if [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]; then
    echo "❌ Passwörter stimmen nicht überein!"
    exit 1
fi

# Generiere sichere Secrets
echo ""
echo "🔐 Generiere sichere Passwörter..."
JWT_SECRET=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -hex 16)

# Erstelle .env Datei
echo "📄 Erstelle Konfigurationsdatei..."

cat > server-mvp/.env <<EOF
# ========================================
# QuizDojo Konfiguration
# Automatisch generiert am $(date +"%Y-%m-%d %H:%M:%S")
# ========================================

# Datenbank
POSTGRES_USER=pruefungstrainer
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_DB=pruefungstrainer
POSTGRES_PORT=5432
DATABASE_URL=postgresql://pruefungstrainer:${DB_PASSWORD}@postgres:5432/pruefungstrainer

# API
API_PORT=8000

# Sicherheit
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d

# Admin-Benutzer
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_USERNAME=admin

# CORS
CORS_ORIGIN=http://localhost:3000

# E-Mail (optional)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@example.com

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# Frontend
FRONTEND_PORT=3000
EOF

echo "✅ Konfiguration erstellt!"
echo ""
echo "╔═══════════════════════════════════════╗"
echo "║   Installation abgeschlossen! 🎉     ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "Nächster Schritt:"
echo ""
echo "  docker compose up -d"
echo ""
echo "Dann öffne im Browser:"
echo ""
echo "  http://localhost:3000"
echo ""
echo "Login:"
echo "  Email:    ${ADMIN_EMAIL}"
echo "  Passwort: (das von dir gewählte Passwort)"
echo ""
echo "📚 Dokumentation: docs/GETTING_STARTED.md"
echo ""
