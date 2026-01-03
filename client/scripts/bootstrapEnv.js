/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const CWD = process.cwd();

const envLocalPath = path.join(CWD, '.env.local');
const envPath = path.join(CWD, '.env');
const envExamplePath = path.join(CWD, '.env.example');
const altExamplePath = path.join(CWD, 'env.example');

const fileExists = filePath => {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
};

const copyFile = (fromPath, toPath) => {
  fs.copyFileSync(fromPath, toPath);
};

// CRA loads .env.local / .env. Some contributors historically put values into
// .env.example. After pulls, that causes "Supabase is not configured" unless we
// bootstrap a real env file for local dev.
if (!fileExists(envLocalPath) && !fileExists(envPath)) {
  const templates = [envExamplePath, altExamplePath];
  const usedTemplate = templates.find(templatePath => {
    if (!fileExists(templatePath)) return false;
    try {
      copyFile(templatePath, envLocalPath);
      return true;
    } catch {
      return false;
    }
  });

  if (usedTemplate) {
    console.log(
      `[env] Created client/.env.local from ${path.basename(
        usedTemplate
      )}. Edit client/.env.local with real values, then restart if needed.`
    );
  } else {
    console.log(
      '[env] No .env.local/.env found, and no readable .env.example/env.example template found. Skipping env bootstrap.'
    );
  }
}


