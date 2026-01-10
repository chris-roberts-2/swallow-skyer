# Scripts

This directory contains **helper scripts for local development and CI-style checks**. These scripts are not part of the deployed frontend (GitHub Pages) or backend (Render) runtime.

## Structure

- `development/`: local setup + test runners
- `deployment/`: placeholder deployment helpers (frontend build + TODO sections)
- `setup.sh`: one-shot local setup convenience

## Common usage

Initial setup:

```bash
./scripts/setup.sh
```

Local dev helpers:

```bash
./scripts/development/start-dev.sh
./scripts/development/run-tests.sh
```

Frontend production build (for GitHub Pages):

```bash
cd client
npm run build
```

## Notes

- The deployed frontend is the **static build output** (`client/build/`).
- The deployed backend is the **Flask API** from `server/` (hosted separately on Render).
