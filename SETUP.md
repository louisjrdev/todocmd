# Setup Guide for GitHub Releases

This guide explains how to set up your TodoCmd repository on GitHub to enable automated releases.

## Repository Setup

### 1. Create GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository
2. Name it `todocmd` (or your preferred name)
3. Make it public or private as desired
4. Don't initialize with README (we already have one)

### 2. Push Your Code

```bash
# Add all files to git
git add .

# Make initial commit
git commit -m "Initial commit: TodoCmd desktop app with automated releases"

# Add GitHub remote (replace 'louisjrdev' with your GitHub username)
git remote add origin https://github.com/louisjrdev/todocmd.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### 3. Configure Repository Settings

1. Go to your repository on GitHub
2. Click **Settings** tab
3. Scroll to **Actions** → **General**
4. Under **Workflow permissions**, select:
   - ✅ **Read and write permissions**
   - ✅ **Allow GitHub Actions to create and approve pull requests**
5. Click **Save**

## Creating Your First Release

### Option 1: Using Git Tags (Recommended)

```bash
# Create and push a version tag
git tag v1.0.0
git push origin v1.0.0
```

### Option 2: Using GitHub Web Interface

1. Go to your repository on GitHub
2. Click **Releases** (on the right sidebar)
3. Click **Create a new release**
4. Enter tag version: `v1.0.0`
5. Enter release title: `TodoCmd v1.0.0`
6. Optionally add release notes
7. Click **Publish release**

## What Happens Next

1. **GitHub Actions Triggers**: The release workflow automatically starts
2. **Multi-Platform Build**: Builds run simultaneously on:
   - macOS (creates .dmg and .zip files)
   - Windows (creates .exe installer and portable)
   - Linux (creates .AppImage, .deb, and .rpm)
3. **Automatic Release**: All build artifacts are attached to your GitHub release
4. **Download Ready**: Users can download platform-specific installers

## Monitoring Builds

1. Go to **Actions** tab in your repository
2. Click on the running "Build and Release" workflow
3. Monitor progress of each platform build
4. Check logs if any builds fail

## Updating Badge URLs

Update the badge URLs in README.md to match your repository:

```markdown
[![Build and Release](https://github.com/louisjrdev/todocmd/actions/workflows/release.yml/badge.svg)](https://github.com/louisjrdev/todocmd/actions/workflows/release.yml)
[![Build Test](https://github.com/louisjrdev/todocmd/actions/workflows/test.yml/badge.svg)](https://github.com/louisjrdev/todocmd/actions/workflows/test.yml)
```

## File Structure

After setup, your repository will have:

```
todocmd/
├── .github/
│   └── workflows/
│       ├── release.yml      # Main release workflow
│       └── test.yml         # PR/push testing
├── src/                     # Source code
├── assets/                  # Icons and resources
├── scripts/                 # Build scripts
├── .gitignore              # Git ignore rules
├── BUILD.md                # Build instructions
├── RELEASE.md              # Release process docs
├── README.md               # Main documentation
└── package.json            # Project configuration
```

## Troubleshooting

### Workflow Doesn't Trigger
- Ensure tag follows `v*` pattern (e.g., `v1.0.0`, `v2.1.3`)
- Check repository permissions allow Actions
- Verify workflow files are in `.github/workflows/`

### Build Fails
- Check Actions tab for detailed error logs
- Ensure all dependencies are listed in `package.json`
- Test builds locally first with `npm run dist`

### No Release Created
- Verify the workflow completed successfully
- Check that `contents: write` permission is granted
- Ensure tag was pushed to GitHub (`git push --tags`)

## Next Steps

1. **Test the Process**: Create a test release (v0.1.0) to verify everything works
2. **Customize Release Notes**: Edit the workflow to include your changelog
3. **Add Code Signing**: Configure certificates for trusted installations
4. **Set Up Auto-Updates**: Consider implementing electron-updater

Your TodoCmd app is now ready for automated, professional releases! 🚀
