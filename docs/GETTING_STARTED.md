# Getting Started with QuizDojo

Welcome to QuizDojo! This guide will help you set up and run the application on your local machine or server.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

### Option 1: Docker (Recommended)
- **Docker** 20.10 or higher
- **Docker Compose** 1.29 or higher

### Option 2: Manual Installation
- **Node.js** 20 or higher
- **PostgreSQL** 16 or higher
- **npm** or **yarn**

## 🚀 Quick Start with Docker Compose

The easiest way to get started is using Docker Compose, which sets up all services automatically.

### Step 1: Clone the Repository

```bash
git clone https://github.com/andremadstop/quizdojo.git
cd quizdojo
```

### Step 2: Configure Environment

Copy the example environment file and edit it with your settings:

```bash
cp server-mvp/.env.example server-mvp/.env
nano server-mvp/.env  # or use your favorite editor
```

**Required changes:**

1. **JWT_SECRET** - Generate a secure random string:
   ```bash
   openssl rand -hex 32
   ```
   Copy the output and set it in `.env`:
   ```
   JWT_SECRET=your_generated_secret_here
   ```

2. **Admin Credentials** - Change the default admin password:
   ```
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=your_secure_password_here
   ```

3. **Database Password** - Change the default database password:
   ```
   POSTGRES_PASSWORD=your_secure_db_password
   ```

4. **CORS Origin** - Set to your frontend URL:
   ```
   CORS_ORIGIN=http://localhost:3000
   ```

### Step 3: Start the Application

```bash
docker-compose up -d
```

This will:
- Start PostgreSQL database
- Initialize the database schema automatically
- Start the Express.js API backend
- Start the Nginx frontend server
- Create the admin user from your `.env` file

### Step 4: Verify Services

Check that all services are running:

```bash
docker-compose ps
```

You should see three containers running:
- `quizdojo_postgres` (PostgreSQL)
- `quizdojo_api` (Express.js API)
- `quizdojo_frontend` (Nginx)

### Step 5: Access the Application

Open your browser and navigate to:

- **Frontend**: http://localhost:3000
- **API Health Check**: http://localhost:8000/health

### Step 6: Login

Use the admin credentials you set in `.env`:
- **Email**: Your `ADMIN_EMAIL`
- **Password**: Your `ADMIN_PASSWORD`

## 🎯 First Steps After Login

### 1. Import Sample Datasets

The application comes with 6 sample Swipe quiz pools:
- Computer History (Computergeschichte)
- Linux Basics
- Network Fundamentals
- Cisco Networking
- Service & Support
- Security & CySA

These are already included in `site/datasets/` and can be imported via the UI:
1. Navigate to **Pools** tab
2. Click **Import**
3. Select a JSON file from `site/datasets/`
4. Confirm import

### 2. Explore Learning Modes

Try out the different learning modes:
- **Training**: Free practice with immediate feedback
- **Swipe**: Tinder-style True/False quiz
- **Speedrun**: Time-based challenges
- **Exam**: Simulated test with timer
- **Leitner**: Spaced repetition learning

### 3. Configure Language

Switch between German, English, and Russian:
- Click the language dropdown (top right)
- Select your preferred language
- Individual questions can be toggled per language

## 🛠️ Manual Installation (Without Docker)

If you prefer to run services manually:

### Step 1: Install PostgreSQL

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql-16

# macOS (Homebrew)
brew install postgresql@16
```

### Step 2: Create Database

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE pruefungstrainer;
CREATE USER pruefungstrainer WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE pruefungstrainer TO pruefungstrainer;
\q
```

### Step 3: Initialize Database Schema

```bash
psql -U pruefungstrainer -d pruefungstrainer -f server-mvp/db/schema.sql
```

### Step 4: Install Node.js Dependencies

```bash
cd server-mvp/node-app
npm install
```

### Step 5: Configure Environment

```bash
cp ../env.example ../.env
nano ../.env  # Edit DATABASE_URL, JWT_SECRET, etc.
```

### Step 6: Start Backend API

```bash
npm start
# Or for development with auto-reload:
npm run dev
```

The API will start on http://localhost:8000

### Step 7: Serve Frontend

Use any static file server for the frontend:

```bash
# Option 1: Python HTTP server
cd ../../site
python3 -m http.server 3000

# Option 2: Node.js http-server
npm install -g http-server
http-server site -p 3000

# Option 3: Nginx
# Configure Nginx to serve site/ directory
```

The frontend will be available at http://localhost:3000

## 📊 Development Mode

For development with hot-reload:

### Backend (with nodemon)

```bash
cd server-mvp/node-app
npm install --save-dev nodemon
npx nodemon src/index.js
```

### Frontend

Just edit files in `site/` and refresh your browser. For CSS changes:
- Files are in `site/css/`
- No build step required

## 🔍 Importing Custom Question Pools

### Format

Question pools must be in JSON format. See [DATASET_FORMAT.md](DATASET_FORMAT.md) for the complete specification.

### Via UI

1. Navigate to **Pools** tab
2. Click **Import**
3. Select JSON file
4. Enter pool name (or use name from file)
5. Confirm import

### Via API

```bash
curl -X POST http://localhost:8000/pools \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @your_pool.json
```

## 🧪 Running Tests

```bash
cd server-mvp/node-app
npm test
```

## 📝 Logs

### Docker Compose

View logs for all services:
```bash
docker-compose logs -f
```

View logs for specific service:
```bash
docker-compose logs -f api
docker-compose logs -f postgres
```

### Manual Installation

Backend logs are written to:
- Console output (stdout)
- Optional: Configure file logging in `src/index.js`

## 🔧 Troubleshooting

### Port Already in Use

If ports 3000, 5432, or 8000 are already in use, change them in `.env`:

```
FRONTEND_PORT=3001
POSTGRES_PORT=5433
API_PORT=8001
```

Then restart:
```bash
docker-compose down
docker-compose up -d
```

### Database Connection Failed

Check that PostgreSQL is running:
```bash
docker-compose ps postgres
```

Verify credentials in `.env` match `docker-compose.yml`.

### Admin User Not Created

Check API logs:
```bash
docker-compose logs api | grep -i admin
```

If admin creation failed, you can create manually via SQL:
```sql
INSERT INTO users (id, username, email, password_hash, role)
VALUES (
  gen_random_uuid(),
  'admin',
  'admin@example.com',
  -- bcrypt hash for 'changeme'
  '$2a$10$...',
  'admin'
);
```

### Cannot Import Datasets

1. Verify JSON format is valid:
   ```bash
   cat dataset.json | jq .
   ```

2. Check file size (should be < 10MB)

3. Verify you're logged in as admin

## 🌐 Changing Languages

The application supports 3 languages:
- **German (DE)** - Default
- **English (EN)**
- **Russian (RU)**

Change UI language:
- Click language dropdown (top right, gate screen or main header)
- Select desired language

Change question language:
- Each question has language toggle pills
- Click DE/EN/RU to switch question language
- Original language is highlighted

## 📚 Next Steps

- [Installation & Deployment Guide](INSTALLATION.md) - Production setup
- [API Documentation](API_DOCUMENTATION.md) - API endpoints reference
- [Architecture Overview](ARCHITECTURE.md) - System design
- [Dataset Format](DATASET_FORMAT.md) - Create custom question pools

## 💡 Tips

1. **Start Small**: Import 1-2 pools first to test
2. **Use Swipe Mode**: Great for quick review
3. **Leitner System**: Best for long-term retention
4. **Speedrun**: Test your knowledge under pressure
5. **Duels**: Challenge friends for motivation

## 🆘 Getting Help

- 📖 [Full Documentation](../README.md)
- 🐛 [Issue Tracker](https://github.com/andremadstop/quizdojo/issues)
- 💬 [Discussions](https://github.com/andremadstop/quizdojo/discussions)

---

**Happy Learning! 🎓**
