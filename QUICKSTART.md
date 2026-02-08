# QuizDojo - Schnellstart (3 Minuten)

**Voraussetzungen:** Server mit Docker installiert

## 🚀 Installation in 3 Schritten

### Schritt 1: Herunterladen

```bash
git clone https://github.com/andremadstop/quizdojo.git
cd quizdojo
```

**Kein Git?** Alternativ: [Download ZIP](https://github.com/andremadstop/quizdojo/archive/refs/heads/main.zip)

### Schritt 2: Konfigurieren

```bash
./install.sh
```

Das Script fragt dich nach:
- Admin E-Mail
- Admin Passwort
- Fertig!

### Schritt 3: Starten

```bash
docker compose up -d
```

**Das war's!** 🎉

Öffne im Browser: **http://localhost:3000**

Login:
- Email: Die Admin-Email die du eingegeben hast
- Passwort: Das Admin-Passwort das du eingegeben hast

---

## ⚙️ Manuelle Installation (wenn install.sh nicht funktioniert)

### 1. Umgebung kopieren

```bash
cp server-mvp/.env.example server-mvp/.env
```

### 2. Passwort generieren

```bash
openssl rand -hex 32
```

Kopiere das Ergebnis (z.B. `a1b2c3d4e5f6...`)

### 3. Konfiguration bearbeiten

```bash
nano server-mvp/.env
```

**Ändere diese Zeilen:**

```bash
JWT_SECRET=a1b2c3d4e5f6...              # <- Das generierte Passwort einfügen
ADMIN_EMAIL=deine@email.com             # <- Deine Email
ADMIN_PASSWORD=dein_sicheres_passwort   # <- Dein gewünschtes Admin-Passwort
```

Speichern: **Ctrl+O**, Enter, **Ctrl+X**

### 4. Starten

```bash
docker compose up -d
```

---

## 🔍 Funktioniert es?

**Prüfen:**
```bash
docker compose ps
```

Du solltest 3 Container sehen:
- `quizdojo_postgres` (Datenbank)
- `quizdojo_api` (Backend)
- `quizdojo_frontend` (Webseite)

**Logs ansehen:**
```bash
docker compose logs -f
```

**Beenden:** Ctrl+C

---

## 🌐 Eigene Domain verwenden

### 1. Domain auf Server zeigen lassen

Erstelle einen DNS A-Record:
```
deine-domain.com → Deine Server IP
```

### 2. SSL-Zertifikat (HTTPS)

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d deine-domain.com
```

### 3. Domain in Config eintragen

```bash
nano server-mvp/.env
```

Ändere:
```bash
CORS_ORIGIN=https://deine-domain.com
```

### 4. Neu starten

```bash
docker compose restart
```

Jetzt erreichbar unter: **https://deine-domain.com**

---

## 🆘 Probleme?

### "Port bereits belegt"

```bash
docker compose down
docker compose up -d
```

### "Kann nicht verbinden"

Firewall öffnen:
```bash
sudo ufw allow 3000/tcp
sudo ufw allow 8000/tcp
```

### Alles löschen und neu starten

```bash
docker compose down -v
docker compose up -d
```

---

## 📚 Mehr Infos

- [Vollständige Dokumentation](docs/GETTING_STARTED.md)
- [API Referenz](docs/API_DOCUMENTATION.md)
- [Fragen stellen](https://github.com/andremadstop/quizdojo/discussions)

---

**Viel Erfolg! 🎓**
