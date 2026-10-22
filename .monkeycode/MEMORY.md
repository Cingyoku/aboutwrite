# User Instruction Memory

This file records user instructions, preferences, and teachings for reference in future interactions.

## Format

### User Instruction Entry
User instruction entries should follow this format:

[User Instruction Summary]
- Date: [YYYY-MM-DD]
- Context: [Mentioned scenario or time]
- Instructions:
  - [Content of user teaching or instruction, described line by line]

### Project Knowledge Entry
Entries discovered by the Agent during task execution should follow this format:

[Project Knowledge Summary]
- Date: [YYYY-MM-DD]
- Context: Discovered by Agent while performing [specific task description]
- Category: [Operations & Deployment|Build Methods|Testing Methods|Troubleshooting & Debugging|Workflow & Collaboration|Environment Configuration]
- Instructions:
  - [Specific knowledge points, described line by line]

## Entries

[Project Knowledge Summary]
- Date: 2026-10-22
- Context: Discovered by Agent while building the writing-studio Electron project
- Category: Build Methods
- Instructions:
  - Dev server / browser preview: `npm run dev` (Vite, port 5173), renderer falls back to localStorage when `window.electronAPI` is absent
  - Production renderer build: `npm run build` (output `dist/`, base `./` so Electron loads via file://)
  - Electron desktop run: `npm run electron:dev` (needs real Electron binary) or `npm run electron:start`
  - Win11 installer: run `npm run electron:build` on a Windows machine (electron-builder, NSIS, output `release/`)
  - In this Linux sandbox install deps with `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install` to skip the Electron binary download; Windows does not need the flag
