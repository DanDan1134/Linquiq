const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// expo-sqlite's web build loads its wa-sqlite engine as a .wasm file. Metro
// needs `wasm` registered as an asset extension or it fails to resolve it
// with "Unable to resolve ./wa-sqlite/wa-sqlite.wasm" when bundling for web.
if (!config.resolver.assetExts.includes("wasm")) {
  config.resolver.assetExts.push("wasm");
}

module.exports = withNativeWind(config, { input: "./global.css" });

