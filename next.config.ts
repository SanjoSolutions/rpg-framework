import type { NextConfig } from "next"
import createNextJsObfuscator from "@sanjo/nextjs-obfuscator"

const withNextJsObfuscator = createNextJsObfuscator(
  {
    compact: true,
    renameGlobals: true,
    renameProperties: false,
    identifierNamesCache: {},
    deadCodeInjection: true,
    selfDefending: false,
    debugProtection: false,
    simplify: true,
    disableConsoleOutput: true,
    target: "browser",
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    numbersToExpressions: true,
    transformObjectKeys: true,
    splitStrings: true,
    splitStringsChunkLength: 8,
    stringArrayEncoding: ["rc4"],
    stringArrayThreshold: 1,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayWrappersCount: 4,
    stringArrayWrappersType: "function",
    stringArrayWrappersChainedCalls: true,
    stringArrayShuffle: true,
    stringArrayRotate: true,
  },
  {
    enabled: "detect",
    log: false,
    patterns: ["./src/**/*.ts", "./src/**/*.tsx", "./src/**/*.js", "./src/**/*.jsx"],
  }
)

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
}

export default withNextJsObfuscator(nextConfig)
