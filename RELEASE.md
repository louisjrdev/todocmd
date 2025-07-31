# Release Process

This document describes how to create releases for TodoCmd using GitHub Actions.

## Automated Releases

The project uses GitHub Actions to automatically build and release packages for macOS, Windows, and Linux.

### Creating a Release

1. **Update Version** (if needed):
   ```bash
   npm version patch  # For bug fixes (1.0.0 -> 1.0.1)
   npm version minor  # For new features (1.0.0 -> 1.1.0)
   npm version major  # For breaking changes (1.0.0 -> 2.0.0)
   ```

2. **Create and Push Tag**:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
   
   Or create a tag directly on GitHub:
   - Go to your repository
   - Click "Releases" → "Create a new release"
   - Enter tag version (e.g., `v1.0.1`)
   - Click "Create release"

3. **Wait for Build**:
   - GitHub Actions will automatically trigger
   - Builds will run on macOS, Windows, and Linux
   - Release artifacts will be automatically attached

### Manual Release Trigger

You can also trigger releases manually:

1. Go to your repository's "Actions" tab
2. Select "Build and Release" workflow
3. Click "Run workflow"
4. Choose the branch and click "Run workflow"

## Release Artifacts

Each release includes:

### macOS
- `TodoCmd-{version}.dmg` - Universal installer (Intel + Apple Silicon)
- `TodoCmd-{version}-arm64.dmg` - Apple Silicon only
- `TodoCmd-{version}-mac.zip` - Portable universal app

### Windows
- `TodoCmd Setup {version}.exe` - NSIS installer
- `TodoCmd {version}.exe` - Portable executable

### Linux
- `TodoCmd-{version}.AppImage` - Universal Linux app
- `TodoCmd_{version}_amd64.deb` - Debian/Ubuntu package
- `TodoCmd-{version}.x86_64.rpm` - RedHat/Fedora package

## Workflow Details

### Build Matrix
The workflow runs on three platforms simultaneously:
- **macOS** (`macos-latest`): Builds macOS packages
- **Ubuntu** (`ubuntu-20.04`): Builds Linux packages
- **Windows** (`windows-latest`): Builds Windows packages

### Build Steps
1. **Checkout**: Downloads the repository code
2. **Setup Node.js**: Installs Node.js 18 with npm cache
3. **Install Dependencies**: Runs `npm ci` for clean install
4. **Build Application**: Compiles TypeScript and bundles React
5. **Build Electron**: Creates platform-specific packages
6. **Upload Artifacts**: Stores build outputs
7. **Create Release**: Publishes GitHub release with all artifacts

### Security
- Uses GitHub's built-in `GITHUB_TOKEN`
- No external secrets required
- Artifacts are automatically signed (where supported)

## Testing Builds

Pull requests and pushes to main/master trigger test builds:
- Builds on all three platforms
- Tests that the app compiles and starts
- No artifacts are published

## Troubleshooting

### Build Fails
1. Check the Actions tab for error logs
2. Common issues:
   - Missing dependencies
   - TypeScript compilation errors
   - Webpack build failures
   - electron-builder configuration issues

### Release Not Created
1. Ensure tag follows `v*` format (e.g., `v1.0.0`)
2. Check that workflow has `contents: write` permissions
3. Verify all platform builds completed successfully

### Missing Artifacts
1. Check individual job logs in Actions tab
2. Ensure all platforms completed successfully
3. Verify artifact file patterns match build outputs

## Local Testing

Test the build process locally before releasing:

```bash
# Test individual platforms
npm run dist:mac
npm run dist:win     # Requires Wine on macOS/Linux
npm run dist:linux

# Test all platforms (if supported)
npm run dist:all
```

## Version Management

The project follows semantic versioning:
- **Patch** (1.0.0 → 1.0.1): Bug fixes, minor improvements
- **Minor** (1.0.0 → 1.1.0): New features, backwards compatible
- **Major** (1.0.0 → 2.0.0): Breaking changes

Update the version in `package.json` before creating releases, or use `npm version` commands which automatically update the file and create git tags.
