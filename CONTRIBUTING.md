# Contributing to CAP-MCP Plugin

Thank you for your interest in contributing to the CAP-MCP Plugin! This document provides guidelines and information for contributors.

## 🚀 Quick Start

### Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Version 8 or higher  
- **Git**: For version control
- **SAP CAP**: Version 9 or higher (for testing)

### Development Setup

1. **Fork the repository**
   - Go to https://github.com/gavdilabs/cap-mcp-plugin
   - Click the "Fork" button to create your own copy

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/cap-mcp-plugin.git
   cd cap-mcp-plugin
   ```

3. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/gavdilabs/cap-mcp-plugin.git
   ```

4. **Install dependencies**
   ```bash
   npm install
   ```

5. **Build the project**
   ```bash
   npm run build
   ```

6. **Run tests**
   ```bash
   npm test
   ```

## 📋 Development Commands

### Building and Testing
```bash
npm run build          # Compile TypeScript to JavaScript in lib/
npm test               # Run Jest test suite
npm run test:unit      # Run unit tests only
npm run test:integration # Run integration tests only
npm run lint           # Run ESLint
npm run format         # Check code formatting with Prettier
npm run format:fix     # Fix formatting issues
```

### Development and Demo
```bash
npm run mock           # Start demo CAP service with MCP plugin
npm run mock:watch     # Start demo with watch mode
npm run inspect        # Start MCP Inspector for testing MCP implementation
npm run build:watch    # Build in watch mode
```

## 🏗️ Project Structure

```
cap-mcp/
├── src/                    # TypeScript source code
│   ├── annotations/        # Annotation parsing system
│   ├── auth/              # Authentication handling
│   ├── config/            # Configuration management  
│   ├── mcp/               # Core MCP implementation
│   └── *.ts               # Main plugin files
├── lib/                   # Compiled JavaScript output
├── test/                  # Test suite
│   ├── demo/              # Demo CAP application
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── bruno/                 # API testing collection
└── docs/                  # Additional documentation
```

## 🧪 Testing

### Running Tests

- **All tests**: `npm test`
- **Unit tests**: `npm run test:unit`
- **Integration tests**: `npm run test:integration`
- **Watch mode**: `npm test -- --watch`
- **Specific pattern**: `npm test -- --testPathPattern=annotations`

### Test Coverage

We aim for comprehensive test coverage. When adding new features:

1. Write unit tests for individual functions/classes
2. Add integration tests for end-to-end workflows
3. Update the demo application if needed
4. Test with the Bruno collection for HTTP API validation

### Demo Application

The `test/demo/` directory contains a working CAP bookshop application with MCP annotations. Use this for:

- Testing new features
- Demonstrating functionality
- Manual testing workflows

Start the demo with: `npm run mock`

## 💻 Code Style

### TypeScript Guidelines

- Use TypeScript strict mode
- Provide comprehensive JSDoc comments for all public APIs
- Follow existing naming conventions
- Use meaningful variable and function names

### Formatting

We use Prettier with the following configuration:
- 2 spaces for indentation
- Semicolons required
- Double quotes for strings
- Trailing commas where valid

Code is automatically formatted on commit via Husky pre-commit hooks.

### Linting

We use ESLint with SAP CAP's recommended configuration. Run `npm run lint` to check for issues.

## 📝 Commit Guidelines

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test additions/modifications
- `chore`: Build process or auxiliary tool changes

Examples:
```
feat(annotations): add support for custom resource templates
fix(mcp): resolve session cleanup race condition
docs: update API documentation for tool annotations
```

### Pre-commit Hooks

Husky automatically runs the following on commit:
- ESLint on TypeScript and JavaScript files
- Prettier formatting on all applicable files
- Type checking

## 🔧 Architecture Guidelines

### Core Principles

1. **Plugin Architecture**: Follow CAP's standard plugin patterns
2. **Type Safety**: Leverage TypeScript for robust type checking
3. **Error Handling**: Provide comprehensive error messages and graceful degradation
4. **Performance**: Consider session management and resource cleanup
5. **Security**: Validate all inputs and respect authentication boundaries

### Adding New Features

1. **Annotations**: New annotation types go in `src/annotations/`
2. **MCP Features**: Core MCP functionality in `src/mcp/`
3. **Configuration**: Config options in `src/config/`
4. **Authentication**: Auth features in `src/auth/`

### Key Implementation Notes

- Each MCP client gets a unique session with its own server instance
- Sessions are tracked by UUID and cleaned up on disconnect
- CDS types are mapped to Zod schemas for MCP parameter validation
- OData operators are converted to CDS query syntax

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Environment**: Node.js version, CAP version, OS
2. **Steps to reproduce**: Clear, minimal reproduction steps
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Logs**: Relevant error messages or logs
6. **Configuration**: Relevant MCP annotations and configuration

## 💡 Feature Requests

For feature requests:

1. Check existing issues to avoid duplicates
2. Provide clear use case and rationale
3. Consider backwards compatibility
4. Suggest implementation approach if possible

## 📖 Documentation

### Code Documentation

- All public APIs must have JSDoc comments
- Include parameter descriptions and return types
- Provide usage examples where helpful
- Document any side effects or important behavior

### README Updates

When adding features that affect usage:

1. Update the main README.md
2. Add examples to the demo application
3. Update CLAUDE.md with development notes
4. Consider adding to the docs/ directory

## 🔄 Pull Request Process

1. **Fork and Branch**: Fork the repository and create a feature branch
2. **Keep Updated**: Regularly sync with upstream main branch
3. **Develop**: Make your changes following these guidelines
4. **Test**: Ensure all tests pass and add new tests as needed
5. **Document**: Update documentation as needed
6. **Submit**: Create a pull request with a clear description

### Syncing with Upstream

Before starting work and before submitting a PR:

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

### PR Requirements

- [ ] Forked from the main repository
- [ ] All tests passing
- [ ] Code follows style guidelines
- [ ] New features have tests
- [ ] Documentation updated
- [ ] No breaking changes (or clearly documented)
- [ ] Conventional commit messages

## 🤝 Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Maintain a welcoming environment

## 📞 Getting Help

- **Issues**: GitHub issues for bugs and features
- **Documentation**: Check README.md and docs/
- **Demo**: Use the test/demo application for examples
- **MCP Inspector**: Use `npm run inspect` for MCP testing

## 📄 License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.

## 🙏 Recognition

Contributors will be recognized in the project documentation and changelog. Thank you for helping make CAP-MCP Plugin better!