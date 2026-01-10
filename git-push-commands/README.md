# Git Push/Pull Scripts

These scripts are for the repository’s Git workflow (pushing branches). They are not part of the deployed application.

⚠️ **Important: Do not delete or move these scripts** if your workflow relies on them. They are unrelated to the GitHub Pages (frontend) / Render (backend) deployment architecture.

## Scripts in this folder:

- `Integration.sh` - Push changes to the foundation branch
- `main.sh` - Push changes to the main branch

## Usage:

Make scripts executable:
```bash
chmod +x ./git-push-commands/Integration.sh
chmod +x ./git-push-commands/main.sh
```

Run scripts:
```bash
./git-push-commands/Integration.sh
./git-push-commands/main.sh
```

## ⚠️ Protection Notice

These scripts are critical for maintaining the project's Git workflow. Do not:
- Delete this folder
- Move scripts to other locations
- Modify the core functionality without understanding the Git branch strategy

Keep this folder structure intact to ensure smooth project management.