import { createDefaultPreset } from "ts-jest";

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  transform: {
    ...tsJestTransformCfg,
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  extensionsToTreatAsEsm: [".ts"],
};
