# MediaMock Browser Extension

A **cross-browser extension** (Chrome, Firefox, Safari) built with [WXT](https://wxt.dev) that enables easy testing of media device functionality on any website using the [@eatsjobs/media-mock](https://www.npmjs.com/package/@eatsjobs/media-mock) library.

## ✨ Features

- **🌍 Cross-Browser Support**: Chrome, Firefox, and Safari compatible
- **📱 Device Simulation**: Mock iPhone 12, Samsung Galaxy M53, or Mac Desktop cameras
- **🎥 Flexible Media Sources**: **Local file uploads** or custom URLs
- **📁 Local File Support**: Upload images and videos directly from your computer
- **🤖 Smart Device Auto-Selection**: Automatically detects browser context and selects appropriate device
- **🔧 Debug Mode**: Visual debugging with canvas and image elements
- **⚡ One-Click Testing**: Test camera access directly from the popup
- **📊 Real-time Status**: Shows whether media mocking is active on the current page
- **🎨 Modern React UI**: Clean, responsive interface built with React

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ 

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Build for your target browser**:
   ```bash
   # Chrome
   npm run build
   
   # Firefox  
   npm run build:firefox
   
   # Safari
   npm run build:safari
   ```

3. **Load the extension**:
   
   **Chrome/Edge:**
   - Open `chrome://extensions/` or `edge://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select `.output/chrome-mv3`
   
   **Firefox:**
   - Open `about:debugging`
   - Click "This Firefox" → "Load Temporary Add-on"
   - Select any file in `.output/firefox-mv2`
   
   **Safari (macOS only):**
   
   Safari Web Extensions require conversion to native App Extensions:
   
   1. **Prerequisites**:
      - macOS 10.14.6+ with Xcode 12+
      - Apple Developer account (for distribution)
   
   2. **Convert to App Extension**:
      ```bash
      xcrun safari-web-extension-converter .output/safari-mv2 --macos-only --project-location ./Safari-MediaMock
      ```
   
   3. **Build in Xcode**:
      - Open `Safari-MediaMock/MediaMock.xcodeproj` 
      - Select your development team in project settings
      - Build and run (⌘+R) - this installs the extension locally
   
   4. **Enable in Safari**:
      - Safari → Preferences → Extensions
      - Enable "MediaMock" extension
      - Grant necessary permissions when prompted
   
   5. **For Distribution** (optional):
      - Archive the app (Product → Archive)
      - Upload to Mac App Store via App Store Connect
      - Safari extensions must be distributed through App Store
   
   **Development Mode**: The extension will be available immediately after building in Xcode for local testing.

## 💡 Usage

### 🤖 **Smart Auto-Selection**
The extension automatically detects your browser context and pre-selects the most appropriate device:
- **iOS Safari** → iPhone 12 (mobile portrait)
- **Android Mobile** → Samsung Galaxy M53 (mobile portrait) 
- **Desktop Browser** → Mac Desktop (desktop landscape)

### 📋 **Manual Steps**
1. **Navigate** to any website that uses camera/microphone
2. **Click** the MediaMock extension icon in the toolbar  
3. **Review** the auto-selected device (indicated by green "AUTO" badge) or manually change if needed
4. **Choose** a media source:
   - **📁 Upload local file** - Images (JPEG, PNG, GIF, WebP) or videos (MP4, WebM, MOV) up to 50MB
   - **🌐 Enter custom URL** - Any accessible image/video URL
5. **Enable** debug mode to see visual debugging elements (optional)
6. **Click** "Start Mock" to begin media mocking
7. **Test** with "Test Camera Access" to verify functionality
8. **Click** "Stop Mock" when finished

## 🏗️ Architecture

Built with **WXT Framework** for optimal cross-browser compatibility:

### 📁 Project Structure
```
entrypoints/
├── popup/              # React popup interface
│   ├── index.html      # Popup HTML
│   ├── main.tsx        # React components
│   └── style.css       # Styling
└── content.ts          # Content script for MediaMock integration

public/
├── media-mock.umd.min.js  # MediaMock library bundle
└── assets/                # Built-in test media files
    ├── ean8_12345670.png     # Barcode test image
    ├── florida_dl_front.png  # ID document image
    └── *.webm/*.mp4          # Video test files
```

### 🔧 Technical Details

**Content Script (`content.ts`)**:
- Imports and exposes MediaMock library directly via ES modules
- Dynamically populates device list from `MediaMock.devices`
- Handles extension ↔ MediaMock library communication with proper TypeScript typing
- Manages device configuration and media URL setup with full type safety
- Provides visual feedback for camera testing

**React Popup (`popup/main.tsx`)**:
- Clean, modern interface with dynamic device selection from library
- **Smart auto-detection** based on browser user agent with visual "AUTO" indicator
- Shows device details (mobile/desktop, resolutions, camera count)
- Real-time status monitoring 
- Built-in asset shortcuts
- Cross-browser messaging APIs with TypeScript interfaces

**WXT Configuration (`wxt.config.ts`)**:
- Automatic manifest generation for all browsers
- Web-accessible resources configuration
- TypeScript and React support
- ES module bundling with MediaMock as dependency

## 🎯 Media Source Options

### **📁 Local File Upload**
- **Supported formats**: JPEG, PNG, GIF, WebP (images), MP4, WebM, MOV, AVI, MKV (videos)
- **File size limit**: 50MB maximum
- **Data processing**: Files converted to data URLs for secure extension use
- **Visual feedback**: File name, size, and type indicator with easy removal


### **🌐 Custom URLs**
- Any publicly accessible image or video URL
- Supports same formats as local files
- Real-time validation and error handling

## 🔧 Development

```bash
# Development with hot reload
npm run dev              # Chrome
npm run dev:firefox      # Firefox  
npm run dev:safari       # Safari

# Type checking
npm run type-check

# Production builds
npm run build           # Chrome (+ auto-zip)
npm run build:firefox   # Firefox
npm run build:safari    # Safari
```

## 🌐 Browser Compatibility

| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| Chrome | 88+ | ✅ Full Support | Direct installation from `.output/chrome-mv3` |
| Edge | 88+ | ✅ Full Support | Uses Chrome build |
| Firefox | 78+ | ✅ Full Support | Direct installation from `.output/firefox-mv2` |
| Safari | 14+ | ✅ Full Support | Requires Xcode conversion, macOS only |

### Safari-Specific Notes:
- **Native App Wrapper**: Safari Web Extensions run inside a native macOS app
- **App Store Requirement**: Public distribution requires Mac App Store approval
- **Permission Model**: More restrictive than Chrome/Firefox
- **Development**: Xcode required for building and testing
- **iOS Support**: Not supported (iOS Safari doesn't support extensions from this type)

## 📝 Permissions

- **`activeTab`**: Access to the current tab for MediaMock injection
- **`scripting`**: Required for content script injection

## 🤝 Integration with MediaMock

The extension seamlessly integrates with the MediaMock library by:
1. **Importing** `@eatsjobs/media-mock` as a proper dependency with full ES module support
2. **Dynamically loading** device configurations from `MediaMock.devices` 
3. **Providing** a user-friendly interface with real-time device information
4. **Converting** relative asset URLs to extension URLs automatically
5. **Managing** mock lifecycle (start/stop/debug) through extension APIs with TypeScript safety

### Key Improvements over UMD approach:
- ✅ **Automatic device sync** - New devices added to MediaMock appear instantly
- ✅ **Smart auto-selection** - Detects browser context and pre-selects appropriate device
- ✅ **Type safety** - Full TypeScript support with proper interfaces
- ✅ **Version consistency** - Always uses the exact MediaMock version specified
- ✅ **Better tree shaking** - Only includes used MediaMock functionality 
- ✅ **Rich device info** - Shows resolutions, camera count, mobile/desktop classification
- ✅ **Intuitive UX** - Visual "AUTO" indicator and seamless device switching
- ✅ **Local file support** - Upload custom media directly from computer with drag & drop UI

Perfect for:
- **QA Testing**: Automated camera/microphone testing
- **Development**: Testing media features without hardware
- **Demos**: Consistent media behavior across environments
- **CI/CD**: Reliable media mocking in headless browsers

---

**Built with ❤️ using [WXT](https://wxt.dev) • Compatible with Chrome, Firefox & Safari**