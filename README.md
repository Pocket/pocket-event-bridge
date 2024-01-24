# PocketEventBridge

> [!IMPORTANT]  
> This repo has been moved to [Pocket's Monorepo](https://github.com/Pocket/pocket-monorepo)

repository that contains pocket shared event bus, and the event-rules associated with it

## Folder structure
- the infrastructure code is present in `.aws`
- the application code is in `src`
- `.docker` contains local setup
- `.circleci` contains circleCI setup

## Develop Locally
```bash
npm install
npm start:dev
```

## Start docker
```bash
# npm ci not required if already up-to-date
npm ci
docker compose up
```
