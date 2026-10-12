
# Fungus Sapiens — Expo mobile app 🍄

This is a React Native mobile application built with Expo and Expo Router.

## Requirements

Before starting, make sure you have:

- Node.js 22.13 or newer (required for Expo SDK 57)
- npm (included with Node.js)
- A terminal (PowerShell, CMD, or VS Code)
- Expo Go installed on your phone (compatible with Expo SDK 57)

Check your Node.js and npm versions:

```bash
node -v
npm -v
```

## Getting Started

### 1. Open the project directory

Open your terminal and navigate to the mobile folder:

```powershell
cd E:\Programming_Learning\FungusSapiens\mobile
```

### 2. Install dependencies

```bash
npm install
```

This installs all required dependencies from package.json.

### 3. Start the Expo development server

```bash
npx expo start --go
```

After the server starts, Expo CLI should display a QR code in the terminal.

Keep the terminal open while testing the app.

## What does the --go flag mean?

The `--go` flag tells Expo to launch the application using Expo Go instead of a custom development build.

Available commands:

```bash
npx expo start
```

Starts Expo with automatic launch target selection.

```bash
npx expo start --go
```

Forces Expo Go as the launch target.

```bash
npx expo start --dev-client
```

Targets a custom development build.

This project does not currently use expo-dev-client, so `npx expo start` and `npx expo start --go` should normally behave the same way.

## Running the App on Your Phone

### 1. Install Expo Go

Download Expo Go:

https://expo.dev/go

Make sure your Expo Go version supports Expo SDK 57.

### 2. Connect to Wi-Fi

Connect your computer and phone to the same Wi-Fi network.

### 3. Start Expo

Run:

```bash
npx expo start --go
```

### 4. Scan the QR code

Android:

1. Open Expo Go.
2. Select "Scan QR code".
3. Scan the QR code displayed in your terminal.
4. Wait for the application to load.

iPhone:

1. Open the Camera app.
2. Scan the QR code displayed in your terminal.
3. Tap the link to open the app in Expo Go.
4. Wait for the application to load.

On a physical iPhone, sign in to the same Expo account in Expo CLI and Expo Go.

To log in through the terminal:

```bash
npx expo login
```

## Troubleshooting

### QR code does not appear

Make sure the Expo server starts successfully:

```bash
npx expo start --go
```

If there are errors, check the terminal output.

You can also clear the Metro cache:

```bash
npx expo start --clear
```

### Phone cannot connect to Expo

First, make sure:

- Your phone and computer are on the same Wi-Fi network.
- Your firewall is not blocking the connection.
- Your VPN is not interfering with the connection.

If the connection still fails, stop Expo using Ctrl+C.

Then start Expo using tunnel mode:

```bash
npx expo start --go --tunnel
```

Tunnel mode allows the phone to connect even when a direct local network connection is unavailable.

Note: Tunnel mode can be slower than LAN mode.

If Expo asks you to install a tunnel dependency, follow the instructions in the terminal.

### Expo Go SDK version mismatch

This project uses Expo SDK 57:

```json
"expo": "~57.0.27"
```

Your Expo Go application must support this SDK version.

If you encounter a compatibility error, check:

https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/

Some native libraries are not supported by Expo Go and require a custom development build.

### Dependency issues

Run:

```bash
npx expo-doctor
```

To fix incompatible dependency versions:

```bash
npx expo install --fix
```

### TypeScript errors

Run:

```bash
npx tsc --noEmit
```

### Lint errors

Run:

```bash
npx expo lint
```

## Useful Expo Commands

Start the Expo server:

```bash
npx expo start
```

Start using Expo Go:

```bash
npx expo start --go
```

Start with tunnel connection:

```bash
npx expo start --go --tunnel
```

Clear Metro cache:

```bash
npx expo start --clear
```

Check project health:

```bash
npx expo-doctor
```

Fix incompatible Expo dependencies:

```bash
npx expo install --fix
```

Run TypeScript checks:

```bash
npx tsc --noEmit
```

Run ESLint:

```bash
npx expo lint
```

## Expo Terminal Shortcuts

While the Expo development server is running:

- `a` — Open on Android device or emulator.
- `i` — Open iOS Simulator (macOS).
- `w` — Open web version.
- `s` — Switch between Expo Go and development build.
- `Ctrl+C` — Stop the development server.

Some shortcuts require additional tools or a compatible environment.

## Project Structure

This project uses Expo Router with file-based routing.

Screens are located in:

```text
mobile/
├── assets/
├── scripts/
├── src/
│   ├── app/
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   └── explore.tsx
│   ├── components/
│   ├── constants/
│   └── hooks/
├── app.json
├── package.json
├── package-lock.json
└── README.md
```

Important files:

- `src/app/index.tsx` — Fungus Sapiens home screen.
- `src/app/explore.tsx` — Example Explore screen.
- `src/app/_layout.tsx` — Root layout and navigation.
- `src/components/` — Reusable UI components.
- `app.json` — Expo application configuration.
- `package.json` — Dependencies and npm scripts.

## Resetting the Project

The project includes a reset command:

```bash
npm run reset-project
```

WARNING:

This command can move or delete existing source files inside the `src` and `scripts` directories.

Do not run it unless you intentionally want to reset the project and have backed up your work.

Resetting is NOT required to start Expo or generate a QR code.

## Important Notes

- You do not need Android Studio to open the app through Expo Go on your Android phone.
- You do not need Xcode to open the app through Expo Go on your iPhone.
- You do not need to create an EAS build just to generate a development QR code.
- A QR code appearing in the terminal means the development server has started, not necessarily that the application is free of errors.
- Keep Expo running while testing your application.
- Changes saved in your project should appear automatically through Fast Refresh.

## Quick Start Summary

For an existing project with dependencies already installed:

```bash
npx expo start --go
```

If this is your first time running the project:

```bash
npm install
npx expo start --go
```

If your phone cannot connect:

```bash
npx expo start --go --tunnel
```

Scan the QR code with Expo Go and open Fungus Sapiens on your phone.

## Documentation

Expo documentation:

https://docs.expo.dev/

Expo Go:

https://expo.dev/go

Expo Router:

https://docs.expo.dev/router/introduction/

Expo CLI:

https://docs.expo.dev/more/expo-cli/

Expo GitHub:

https://github.com/expo/expo
