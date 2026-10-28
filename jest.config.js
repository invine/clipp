import { createDefaultPreset } from "ts-jest";
import { execFileSync } from "node:child_process";

// Hooks export selectors for the parent repository. Fixture Git commands must
// select their own repositories; keep these selectors out of test processes.
const localGitEnvironment = new Set(
  execFileSync("git", ["rev-parse", "--local-env-vars"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
);
for (const name of Object.keys(process.env)) {
  if (localGitEnvironment.has(name) || /^GIT_CONFIG_(KEY|VALUE)_/.test(name))
    delete process.env[name];
}

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/.local/"],
  modulePathIgnorePatterns: ["<rootDir>/.local/"],
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
    "^@core/(.*)$": "<rootDir>/packages/core/$1",
    "^\.\./models/enums$": "<rootDir>/packages/core/models/enums.ts",
    "^\.\./models/enums\\.js$": "<rootDir>/packages/core/models/enums.ts",
    "^\.\.\/\.\.\/models/enums$": "<rootDir>/packages/core/models/enums.ts",
    "^\.\.\/\.\.\/models/Clip$": "<rootDir>/packages/core/models/Clip.ts",
    "^\.\/enums$": "<rootDir>/packages/core/models/enums.ts",
    "^\.\/enums\\.js$": "<rootDir>/packages/core/models/enums.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  extensionsToTreatAsEsm: [".ts"],
};
