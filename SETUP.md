# Windows Setup

## Requirements

- Node.js 20 or higher
- Yarn 1.22.x

## Verify Tools

```powershell
node -v
yarn -v
```

## Install Dependencies

```powershell
yarn install
```

## Start Development

```powershell
yarn dev:all
```

This starts the server, frontend, and collector together.

## Troubleshooting

- If `node -v` shows a version below 20, install Node.js 20 or higher and reopen PowerShell.
- If `cross-env` is missing, run `yarn install` again.
- If install previously failed, delete `node_modules`, `server/node_modules`, `frontend/node_modules`, and `collector/node_modules`, then run `yarn install` again.
