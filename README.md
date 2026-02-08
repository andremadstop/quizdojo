# QuizDojo

> Multilingual exam training platform with spaced repetition, gamification, and social features

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

---

## ⚡ Schnellstart

**Neu hier? Direkt loslegen!** → **[3-Minuten Installation](QUICKSTART.md)** 🚀

```bash
git clone https://github.com/andremadstop/quizdojo.git
cd quizdojo
./install.sh
docker compose up -d
```

**Fertig!** Öffne http://localhost:3000

---

## ✨ Features

- 🎯 **6 Learning Modes**
  - **Training**: Free practice with immediate feedback
  - **Swipe**: Tinder-style binary quiz (True/False)
  - **Speedrun**: Time-based challenges (1/5/10 minutes)
  - **Exam**: Simulated test environment with timer
  - **Leitner**: Spaced repetition system with 5 boxes
  - **Duels**: Challenge friends to 1v1 quizzes

- 🌍 **3 Languages**: German, English, Russian (DE/EN/RU)
  - Full UI translation
  - Per-question language toggle
  - Multilingual question pools

- 🏆 **Gamification**
  - XP and level system
  - Daily streaks
  - Badges and achievements
  - Global leaderboards
  - Community features

- 🐳 **Docker-Ready**: Complete Docker Compose setup for easy self-hosting

- 🔒 **Security**
  - JWT authentication with refresh tokens
  - bcrypt password hashing
  - Rate limiting
  - HTTPS-ready
  - GDPR-compliant privacy features

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose (recommended)
- OR: Node.js 20+, PostgreSQL 16

### Installation with Docker Compose

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/quizdoji.git
cd quizdoji

# 2. Configure environment
cp server-mvp/.env.example server-mvp/.env
nano server-mvp/.env  # Edit JWT_SECRET, ADMIN credentials

# 3. Start all services
docker-compose up -d

# 4. Access the application
# Frontend: http://localhost:3000
# API: http://localhost:8000
```

### Manual Installation

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for detailed manual setup instructions.

## 📚 Documentation

- [Getting Started Guide](docs/GETTING_STARTED.md)
- [Installation & Deployment](docs/INSTALLATION.md)
- [API Documentation](docs/API_DOCUMENTATION.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [Dataset Format](docs/DATASET_FORMAT.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)

## 🏗️ Architecture

- **Frontend**: Single-page application (HTML/CSS/JS), modular CSS architecture
- **Backend**: Express.js REST API with middleware (auth, rate limiting, audit logging)
- **Database**: PostgreSQL 16 with 24 tables, UUID primary keys
- **Authentication**: JWT access tokens + httpOnly refresh cookies

## 📊 Tech Stack

- **Frontend**: Vanilla JavaScript, CSS Custom Properties, i18n
- **Backend**: Node.js 20+, Express.js, pg (PostgreSQL driver), bcryptjs
- **Database**: PostgreSQL 16
- **Deployment**: Docker, Docker Compose, Nginx

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📄 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 🛠️ Development

```bash
# Start development environment
docker-compose up

# Or run manually:
cd server-mvp/node-app
npm install
npm run dev  # if nodemon configured

# Frontend: Open site/index.html in browser or use local server
```

## 🗺️ Roadmap

- [ ] Mobile apps (iOS/Android with Capacitor)
- [ ] More gamification features (contests, achievements)
- [ ] AI-powered question generation
- [ ] Import from Anki/Quizlet
- [ ] SSO authentication (OAuth2)

## 💬 Support

- 📖 [Documentation](docs/)
- 🐛 [Issue Tracker](https://github.com/YOUR_USERNAME/quizdoji/issues)
- 💡 [Discussions](https://github.com/YOUR_USERNAME/quizdoji/discussions)

## 🙏 Acknowledgments

- Built with ❤️ for the learning community
- Inspired by Anki, Quizlet, and Duolingo
- Question datasets compiled from educational resources

---

**Note**: Replace `YOUR_USERNAME` with your GitHub username before publishing.
