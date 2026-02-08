# Contributing to QuizDoji

Thank you for your interest in contributing to QuizDoji! This document provides guidelines and instructions for contributing.

## 📜 Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. Please be respectful and constructive in all interactions.

### Our Standards

**Positive behavior includes:**
- Using welcoming and inclusive language
- Respecting differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community

**Unacceptable behavior includes:**
- Harassment, trolling, or derogatory comments
- Personal or political attacks
- Publishing others' private information
- Other conduct which could reasonably be considered inappropriate

## 🚀 How to Contribute

### Reporting Bugs

Before creating a bug report:
1. Check existing [Issues](https://github.com/YOUR_USERNAME/quizdoji/issues) to avoid duplicates
2. Verify the bug on the latest version

**Good bug reports include:**
- Clear, descriptive title
- Steps to reproduce
- Expected vs actual behavior
- Screenshots (if applicable)
- Environment details (OS, browser, Docker version)

**Template:**
```markdown
## Bug Description
Brief description of the issue

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: [e.g., Ubuntu 22.04]
- Browser: [e.g., Firefox 120]
- Docker Version: [e.g., 24.0.5]
- QuizDoji Version: [e.g., v1.0.0]

## Additional Context
Any other relevant information
```

### Suggesting Features

Feature requests are welcome! Please:
1. Check [existing feature requests](https://github.com/YOUR_USERNAME/quizdoji/issues?q=is%3Aissue+label%3Aenhancement)
2. Explain **why** this feature would be useful
3. Provide use cases and examples

### Contributing Code

#### First-Time Contributors

Look for issues labeled:
- `good first issue` - Simple tasks for newcomers
- `help wanted` - Issues where we need assistance

#### Development Setup

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/quizdoji.git
   cd quizdoji
   ```

2. **Set up development environment**
   ```bash
   # Copy environment file
   cp server-mvp/.env.example server-mvp/.env
   nano server-mvp/.env  # Configure settings

   # Start services
   docker-compose up -d

   # Check logs
   docker-compose logs -f
   ```

3. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

4. **Make your changes**
   - Write clear, readable code
   - Follow existing code style
   - Add comments for complex logic
   - Update documentation if needed

5. **Test your changes**
   ```bash
   # Run backend tests
   cd server-mvp/node-app
   npm test

   # Manual testing checklist:
   # - Does the feature work as expected?
   # - Are there any console errors?
   # - Does it work on mobile?
   # - Does it work in all 3 languages (DE/EN/RU)?
   ```

6. **Commit your changes**
   ```bash
   git add .
   git commit -m "Add amazing feature"
   ```

   See [Commit Message Guidelines](#commit-message-guidelines) below.

7. **Push to your fork**
   ```bash
   git push origin feature/amazing-feature
   ```

8. **Open a Pull Request**
   - Go to the original repository
   - Click "New Pull Request"
   - Select your branch
   - Fill out the PR template

## 📝 Code Style Guidelines

### JavaScript

- **Indentation**: 2 spaces
- **Semicolons**: Optional (be consistent)
- **Quotes**: Single quotes preferred
- **Naming**:
  - Variables/functions: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Classes: `PascalCase`

**Example:**
```javascript
// Good
const userName = 'Alice';
function getUserById(userId) {
  return users.find(u => u.id === userId);
}

// Avoid
var user_name = "Alice";
function GetUserById(user_id) { ... }
```

### HTML/CSS

- **Indentation**: 2 spaces
- **HTML**: Use semantic tags (`<section>`, `<article>`, etc.)
- **CSS**: Keep selectors simple, avoid deep nesting
- **CSS Custom Properties**: Use existing variables in `css/variables.css`

### SQL

- **Keywords**: UPPERCASE
- **Tables/columns**: lowercase_snake_case
- **Always** use parameterized queries (prevent SQL injection)

**Example:**
```javascript
// Good
const result = await db.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);

// NEVER do this (SQL injection vulnerability!)
const result = await db.query(
  `SELECT * FROM users WHERE email = '${email}'`
);
```

## 💬 Commit Message Guidelines

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process, dependencies, etc.

### Examples

```
feat(swipe): add keyboard shortcuts for left/right swipe

Add arrow key and R/L key support for swipe mode.
This improves accessibility and allows faster interaction.

Closes #123
```

```
fix(api): prevent duplicate user registration

Check for existing email before creating user.
Return 409 Conflict if email already exists.

Fixes #456
```

```
docs(readme): update installation instructions

Clarify Docker Compose setup steps and add troubleshooting section.
```

### Rules

- Use imperative mood: "Add feature" not "Added feature"
- First line ≤ 50 characters
- Body lines ≤ 72 characters
- Reference issues: `Closes #123`, `Fixes #456`

## 🧪 Testing

### Running Tests

```bash
cd server-mvp/node-app
npm test
```

### Writing Tests

Add tests for new features:
- Unit tests for utility functions
- Integration tests for API endpoints
- Manual tests for UI changes

**Test file naming:** `feature.test.js`

## 📚 Documentation

### Update Documentation When:
- Adding new features
- Changing API endpoints
- Modifying configuration options
- Updating dependencies

### Documentation Files:
- `README.md` - Overview and quick start
- `docs/GETTING_STARTED.md` - Setup guide
- `docs/API_DOCUMENTATION.md` - API reference
- `docs/ARCHITECTURE.md` - System design
- `docs/INSTALLATION.md` - Deployment guide

## 🔍 Code Review Process

### What Reviewers Check:
- Code quality and readability
- Tests pass
- Documentation updated
- No breaking changes (or clearly documented)
- Security best practices followed
- Performance considerations

### Response Time:
- We aim to review PRs within 3-5 days
- Complex PRs may take longer

### After Review:
- Address feedback
- Push updates to your branch
- PR will auto-update

## 🎯 Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] All tests pass
- [ ] No console errors
- [ ] Works in all 3 languages (DE/EN/RU)
- [ ] Tested on desktop and mobile
- [ ] Commit messages follow guidelines

## 🌍 Translation Contributions

Help translate QuizDoji into more languages!

### Adding a New Language:

1. **Add i18n entries** in `site/index.html`:
   ```javascript
   const I18N = {
     de: { /* German translations */ },
     en: { /* English translations */ },
     ru: { /* Russian translations */ },
     es: { /* NEW: Spanish translations */ }
   };
   ```

2. **Update language selector** in UI

3. **Test all screens** in new language

4. **Update documentation** to mention new language

### Improving Translations:

Found a mistranslation? Open an issue or PR with corrections!

## 📊 Creating Question Pools

Contribute high-quality question pools:

1. **Use the Pool Creator Prompt** in `docs/POOL_CREATOR_PROMPT.md`
2. **Follow JSON format** in `docs/DATASET_FORMAT.md`
3. **Validate JSON** before submitting
4. **Include metadata**: source, license, language
5. **Ensure questions are accurate** and educational

### Pool Guidelines:
- Questions must be factual and verifiable
- Explanations should be clear and helpful
- Avoid copyrighted content without permission
- Prefer CC0 or CC-BY licensed content

## 🏷️ Issue Labels

- `bug` - Something isn't working
- `enhancement` - New feature request
- `documentation` - Documentation improvements
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `question` - Further information requested
- `wontfix` - Will not be worked on

## 🤝 Community

- **Discussions**: [GitHub Discussions](https://github.com/YOUR_USERNAME/quizdoji/discussions)
- **Issues**: [Issue Tracker](https://github.com/YOUR_USERNAME/quizdoji/issues)
- **Security**: See [SECURITY.md](SECURITY.md) for reporting vulnerabilities

## 🙏 Recognition

Contributors will be:
- Listed in release notes
- Mentioned in `CONTRIBUTORS.md` (if they wish)
- Given credit in relevant documentation

## 📄 License

By contributing, you agree that your contributions will be licensed under the GPL-3.0 License.

---

**Thank you for making QuizDoji better! 🎓**
