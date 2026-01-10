# Routes Directory

This directory contains **frontend route components** for the Swallow Skyer React app. These files are bundled into the static build output (`client/build/`) and are not deployed separately.

## Structure

- `HomePage.js` - Landing page component
- `MapPage.js` - Map view with photo markers
- `PhotoPage.js` - Individual photo view
- `UploadPage.js` - Photo upload interface

## Usage

Routes are configured in `App.js` using React Router DOM.

## Routes

- `/` - Home page
- `/map` - Interactive map view
- `/photo/:id` - Individual photo view
- `/photos` - Project photo grid & upload
- `/profile` - User profile
