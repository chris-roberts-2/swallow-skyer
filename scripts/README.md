# Scripts

This directory contains automation and setup scripts for the Swallow Skyer project.

## Structure

- `deployment/` - Production deployment scripts
- `development/` - Development environment setup scripts
- `setup.sh` - Main project setup script

## Usage

### Initial Setup
```bash
./scripts/setup.sh
```

### Development Scripts
```bash
# Start development environment
./scripts/development/start-dev.sh

# Run tests
./scripts/development/run-tests.sh
```

### Deployment Scripts
```bash
# Deploy to staging
./scripts/deployment/deploy-staging.sh

# Deploy to production
./scripts/deployment/deploy-production.sh
```

## Script Permissions

Make scripts executable:
```bash
chmod +x scripts/*.sh
chmod +x scripts/*/*.sh
```
