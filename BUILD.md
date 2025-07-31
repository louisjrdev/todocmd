# Building TodoCmd for Distribution

This guide explains how to create installable packages for Windows, macOS, and Linux.

## Prerequisites

1. **Node.js and npm** (already installed)
2. **electron-builder** (already configured)

## Build Commands

### Build for Current Platform
```bash
npm run dist
```

### Build for Specific Platforms
```bash
# macOS only (creates .dmg and .zip)
npm run dist:mac

# Windows only (creates .exe installer and portable .exe)
npm run dist:win

# Linux only (creates .AppImage, .deb, and .rpm)
npm run dist:linux

# All platforms (requires additional setup)
npm run dist:all
```

## Output Files

Built packages will be created in the `release/` directory:

### macOS
- `TodoCmd-{version}.dmg` - Disk image installer
- `TodoCmd-{version}-mac.zip` - Zip archive
- Universal builds for both Intel and Apple Silicon

### Windows
- `TodoCmd Setup {version}.exe` - NSIS installer
- `TodoCmd {version}.exe` - Portable executable
- Supports both x64 and 32-bit architectures

### Linux
- `TodoCmd-{version}.AppImage` - Universal Linux app
- `TodoCmd_{version}_amd64.deb` - Debian/Ubuntu package
- `TodoCmd-{version}.x86_64.rpm` - Red Hat/Fedora package

## Cross-Platform Building

### Building Windows packages on macOS/Linux
```bash
# Install Wine (macOS with Homebrew)
brew install --cask wine-stable

# Install Wine (Ubuntu/Debian)
sudo apt install wine

# Then run
npm run dist:win
```

### Building macOS packages on Linux/Windows
This requires a macOS machine or VM for legal code signing.

## Icon Files

The build uses these icon files in the `assets/` directory:
- `icon.png` - Linux icon (256x256 or larger)
- `icon.ico` - Windows icon (multiple sizes)
- `icon.icns` - macOS icon (multiple sizes)

To create proper icons from the SVG:
1. Export `assets/icon.svg` to PNG at 1024x1024
2. Use online tools or `electron-icon-builder` to generate ICO and ICNS files

## Code Signing (Optional but Recommended)

### macOS
1. Get an Apple Developer account
2. Create certificates in Xcode
3. Add to `package.json`:
```json
"build": {
  "mac": {
    "identity": "Developer ID Application: Your Name (TEAM_ID)"
  }
}
```

### Windows
1. Get a code signing certificate
2. Add to `package.json`:
```json
"build": {
  "win": {
    "certificateFile": "path/to/certificate.p12",
    "certificatePassword": "password"
  }
}
```

## Auto-Updates (Optional)

To enable auto-updates, consider using:
- **electron-updater** for in-app updates
- **GitHub Releases** for hosting update files

## Troubleshooting

### Build Errors
- Ensure all dependencies are installed: `npm install`
- Clean build: `rm -rf release/ && npm run dist`
- Check electron-builder logs for specific errors

### Missing Icons
- Replace placeholder icon files with real icons
- Ensure icon files are in correct formats and sizes

### Permission Issues
- On macOS: `sudo xattr -cr release/` to fix quarantine issues
- On Linux: `chmod +x release/*.AppImage` to make executable

## Distribution

### macOS
- Upload `.dmg` to your website
- For Mac App Store: use `mas` target instead of `dmg`

### Windows
- Upload `.exe` installer to your website
- Consider Windows Store for wider distribution

### Linux
- Upload `.AppImage` for universal compatibility
- Upload `.deb` and `.rpm` for package managers
- Consider Snap Store or Flatpak for easier installation

## Example Build Workflow

```bash
# 1. Clean previous builds
rm -rf release/

# 2. Build the app
npm run build

# 3. Create distributables
npm run dist:mac    # On macOS
npm run dist:win    # If Wine is installed
npm run dist:linux  # On Linux

# 4. Test the built packages
open release/        # View built files
```

## File Sizes

Approximate package sizes:
- macOS DMG: ~150-200 MB
- Windows EXE: ~100-150 MB
- Linux AppImage: ~120-170 MB

The large size is due to the bundled Chromium runtime that Electron requires.
