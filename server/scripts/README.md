# Server maintenance scripts

This directory contains **one-off, manual scripts** for backend maintenance. These scripts are not part of the deployed Flask API runtime.

## Legacy migration

Run once when migrating legacy project data:

```bash
python server/scripts/migrate_legacy_projects.py
```

