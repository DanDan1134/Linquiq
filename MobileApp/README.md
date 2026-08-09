# Mobile App Frontend

A React Native mobile app frontend built with Expo and NativeWind (Tailwind CSS for React Native).

## What is Expo?

Expo is a platform that makes React Native development much easier by providing:

- **Simple Setup**: No need for Android Studio or Xcode to get started
- **Cross-Platform**: One codebase works on iOS, Android, and Web
- **Built-in Tools**: Development server, debugging, and testing tools included
- **Easy Styling**: Use Tailwind CSS classes with NativeWind instead of complex StyleSheet APIs

## How to Run the App

1. **Install dependencies:**

   ```bash
   cd MyExpoApp
   npm install
   ```

2. **Start the development server:**

   ```bash
   npx expo start
   ```

3. **View on your phone using Expo Go:**
   - Download "Expo Go" app from App Store (iOS) or Google Play Store (Android)
   - Scan the QR code that appears in your terminal
   - The app will load directly on your phone!

## How Expo Go Works

Expo Go is a mobile app that lets you run your React Native app without building it:

- **No Building Required**: Your code runs directly in the Expo Go app
- **Live Reload**: Changes you make appear instantly on your phone
- **Easy Testing**: Test on real devices without complex setup
- **Cross-Platform**: Same QR code works for both iOS and Android

## Features

- File list with different file types
- Search functionality
- Bundle files feature
- Modern dark theme with custom colors
- Responsive design for mobile devices

## Tech Stack

- **Expo** - React Native framework for easy mobile development
- **NativeWind** - Tailwind CSS for React Native styling
- **TypeScript** - Type safety and better development experience
- **React Native** - Cross-platform mobile app development

## Frontend Setup

This frontend was created using:

```bash
npx create-expo-app --template
```

The app uses:

- **Expo CLI** for development and building
- **NativeWind** for styling with Tailwind CSS classes
- **TypeScript** for type safety
- **Expo Go** for testing on real devices
