# Contributing to AurPath

Thank you for considering a contribution to AurPath! This document outlines guidelines for reporting issues, proposing features, and submitting pull requests.

## Code of Conduct

All contributors are expected to treat each other with respect and professionalism. Please help maintain a welcoming environment.

## Reporting Issues

- **Check existing issues** before opening a new one to avoid duplicates
- **Provide clear reproduction steps** including RPC endpoints and transaction signatures where applicable
- **Include relevant logs and JSON output** to aid diagnosis
- **Specify your environment**: Node.js version, platform (Windows/macOS/Linux), and RPC endpoint versions

## Proposing Features

- **Open a discussion issue** before starting major work to get feedback
- **Explain the motivation**: Why is this feature needed? What problem does it solve?
- **Keep scope focused**: Large features should be broken into smaller, reviewable PRs
- **Stay within AurPath's mission**: Tracing and classification only; no wallet management or transaction signing

## Submitting Pull Requests

1. **Fork and branch**: Create a feature branch from `main`
2. **Commit clearly**: Use concise, descriptive commit messages
3. **Run tests and lint**: Ensure all tests pass and code follows the project's linting rules
   ```bash
   npm run lint
   npm run test
   npm run build
   ```
4. **Keep PRs focused**: One feature or fix per PR; avoid mixing concerns
5. **Test your changes**: Add tests for new functionality or bug fixes
6. **Update documentation**: If your change affects CLI usage or API, update README or code comments accordingly

## Development Setup

```bash
# Install dependencies
npm install

# Run tests in watch mode
npm run test:watch

# Build TypeScript
npm run build

# Check linting and formatting
npm run lint
npm run format
```

## Code Style

- Use TypeScript for all source code
- Follow existing patterns in the codebase
- Prefer clarity over cleverness; optimize for readability
- Add comments only where logic is non-obvious

## Questions?

Open an issue with the label `question` or start a discussion in the repository.

Thank you for contributing to AurPath!
