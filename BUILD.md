# Cross-Platform Build Setup

## GitHub Actions (Recommended)

This project uses GitHub Actions to automatically build for Windows, macOS, and Linux.

### How it works:
- **Push to any branch**: Builds all platforms and uploads artifacts
- **Create a tag** (e.g., `v1.0.0`): Builds all platforms and creates a GitHub Release

### To create a release:
```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow will automatically:
1. Run tests on all platforms
2. Build installers for Windows (.exe, .msi), macOS (.dmg), and Linux (.AppImage, .deb, .rpm)
3. Create a GitHub Release with all the installers attached

### Artifacts:
After each build, you can download the installers from:
- GitHub Actions → Your workflow run → Artifacts section

## Local Building

### Windows:
```bash
npm run package              # Build for Windows only
npm run package:dir          # Build unpacked (for testing)
```

### macOS (requires Mac):
```bash
npm run package:mac          # Build for macOS (Intel + Apple Silicon)
```

### Linux (requires Linux or Docker):
```bash
npm run package:linux        # Build for Linux (AppImage, deb, rpm)
```

### All platforms (requires each respective OS):
```bash
npm run package:all          # Build for all platforms
```

## Icon Requirements

- **Windows**: `assets/icon.ico` (256x256, included)
- **macOS**: `assets/icon.icns` (512x512@2x, optional - will use .ico if missing)
- **Linux**: Uses the same icon files

electron-builder will automatically convert formats if only one is provided.

## Code Signing (Optional)

### macOS:
1. Get an Apple Developer certificate
2. Add to GitHub Secrets:
   - `APPLE_ID`
   - `APPLE_ID_PASSWORD`
   - `CSC_LINK` (base64 encoded certificate)
   - `CSC_KEY_PASSWORD`

### Windows:
1. Get a code signing certificate
2. Add to GitHub Secrets:
   - `CSC_LINK` (base64 encoded certificate)
   - `CSC_KEY_PASSWORD`

Without code signing:
- **macOS**: Users will see "unidentified developer" warning
- **Windows**: Users will see SmartScreen warning
- **Linux**: No warnings
