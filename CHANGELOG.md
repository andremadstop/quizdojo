# Changelog

All notable changes to QuizDojo will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (2026-02-09)

#### Major Features
- **Leitner "Road to Mastery"**: Progress Mountain visualization with milestone tracking
  - Visual progress bars showing question distribution across all 5 boxes
  - Milestone celebrations at 25%, 50%, 75%, and 100% mastery
  - Confetti animations for milestone achievements
  - Streak tracking (current streak + longest streak)
  - Session stats (total sessions, success rate, days learning)
  - Database tables: `leitner_milestones`, `leitner_stats`

- **Admin Settings Manager**: Comprehensive control panel for administrators
  - 7 setting categories: Features, Languages, Branding, Access Control, Advanced Config
  - Feature flags for gamification, leaderboards, duels, contests, font size toggle
  - Language toggles (DE/EN/RU)
  - Branding customization (app name, tagline)
  - Access control (registration, guest mode, admin-only features)
  - Failsafe validation prevents breaking configurations

- **Magic Link Authentication**: Passwordless email-based login
  - 6-digit verification code sent via email
  - Clickable magic link in email
  - Auto-registration for new users
  - Improved onboarding flow with clear CTAs
  - Auto-verify code entry (300ms delay after typing 6 digits)
  - Enter-key support for code submission

- **Focus Mode**: Distraction-free exam environment
  - Timer overlay with separate z-index layer
  - Prevents stacking issues with fixed headers
  - Dedicated UI layer for exam mode

- **Font Size Toggle**: Accessibility feature (optional)
  - 3 sizes: Small, Medium, Large
  - Admin-controlled via settings panel
  - Off by default
  - Affects question text, answers, and explanations

#### Bug Fixes
- **CRITICAL**: Fixed Magic Link auth bug where users were immediately logged out after login
  - Root cause: Global `accessToken` variable not set after localStorage write
  - Impact: Magic Link authentication completely broken
  - Fix: Set both localStorage AND global variable in auth handlers

- **CRITICAL**: Fixed Guest Mode not working
  - Root cause: `showProfileGate()` logic error with boolean-or operator
  - Impact: Gate remained open after clicking "Continue as Guest"
  - Fix: Use explicit ternary operator for force parameter

- Fixed Focus Mode z-index stacking issues with fixed headers
- Fixed gate language toggle positioning (moved to top-right corner)

#### Improvements
- Improved user onboarding with redesigned welcome screen
- Better gate UI with clear instructions and placeholders
- Enhanced error messages for failed operations
- Improved mobile responsiveness for login forms

### Changed
- Updated CSS architecture to 14 modular files (Phase 1 CSS Refactoring)
- Database schema now includes 26 tables (added `leitner_milestones`, `leitner_stats`)
- Improved exam and speedrun UI with better layout
- Enhanced admin panel organization

### Documentation
- Added comprehensive pool enhancement guide for Gemini AI
- Updated all feature documentation
- Improved API documentation
- Added troubleshooting guides

---

## [1.0.0] - 2026-02-08

### Added
- Initial public release
- 6 learning modes (Training, Swipe, Exam, Speedrun, Leitner, Duels)
- 3-language support (DE/EN/RU)
- Gamification system (XP, levels, badges, streaks)
- Social features (friends, duels, leaderboards)
- Docker Compose setup for easy self-hosting
- Comprehensive documentation (11 files)
- GPL-3.0 license

### Security
- JWT authentication with refresh tokens
- bcrypt password hashing
- Rate limiting on all endpoints
- GDPR-compliant privacy features

---

## Release Notes

### v1.1.0 (Upcoming)
**Focus**: Gamification, Accessibility, Bug Fixes

**Highlights**:
- 🏆 Leitner "Road to Mastery" with milestone tracking and celebrations
- ⚙️ Comprehensive admin settings panel with feature flags
- 🔐 Magic Link authentication (passwordless, email-based)
- 🎯 Focus Mode for distraction-free exam environment
- ♿ Font Size Toggle for better accessibility
- 🐛 Critical bug fixes for authentication and guest mode

**Breaking Changes**: None

**Migration**: No manual migration needed. Database schema will auto-update with new tables.

---

### v1.0.0
**Initial Public Release**

Full-featured quiz platform with 6 learning modes, gamification, and Docker support.

---

## Upgrade Guide

### From v1.0.0 to v1.1.0

1. **Pull latest changes**:
   ```bash
   git pull origin main
   ```

2. **Update database schema** (automatic on restart):
   ```bash
   docker compose restart postgres
   docker compose restart api
   ```

   New tables will be created automatically:
   - `leitner_milestones`
   - `leitner_stats`

3. **Update environment variables** (optional):
   - Check `.env.example` for new variables
   - Admin settings are managed via UI, no .env changes needed

4. **Restart services**:
   ```bash
   docker compose down
   docker compose up -d
   ```

5. **Verify installation**:
   - Login as admin
   - Navigate to Settings tab
   - Verify all features are accessible

---

## Support

- 📖 [Documentation](docs/)
- 🐛 [Issue Tracker](https://github.com/andremadstop/quizdojo/issues)
- 💬 [Discussions](https://github.com/andremadstop/quizdojo/discussions)
