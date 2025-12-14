import { createDefaultPreset } from "ts-jest";

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  testMatch: [
    "**/tests/**/*.test.ts",
    "**/packages/core/models/__tests__/*.test.ts",
    "**/packages/core/clipboard/__tests__/*.test.ts",
  ],
  transform: {
    ...tsJestTransformCfg,
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  moduleNameMapper: {
    "^\.\./models/enums$": "<rootDir>/packages/core/models/enums.ts",
    "^\.\./models/enums\\.js$": "<rootDir>/packages/core/models/enums.ts",
    "^\.\.\/\.\.\/models/enums$": "<rootDir>/packages/core/models/enums.ts",
    "^\.\.\/\.\.\/models/Clip$": "<rootDir>/packages/core/models/Clip.ts",
    "^\.\/enums$": "<rootDir>/packages/core/models/enums.ts",
    "^\.\/enums\\.js$": "<rootDir>/packages/core/models/enums.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  extensionsToTreatAsEsm: [".ts"],
};
