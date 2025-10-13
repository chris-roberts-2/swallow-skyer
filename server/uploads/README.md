# Server Uploads Directory

## Purpose
This directory serves as **temporary local storage** for uploaded photos during development and testing.

## Storage Strategy
- **Development**: Files stored locally in `server/uploads/`
- **Production**: Files stored in Supabase Storage (cloud)
- **Processing**: Thumbnails generated locally, then uploaded to Supabase

## File Organization
```
uploads/
├── photos/              # Original uploaded photos
│   └── {uuid}.{ext}    # Unique filename format
├── thumbnails/          # Generated thumbnails
│   └── thumb_{uuid}.{ext}
└── temp/               # Temporary processing files
```

## Important Notes
- ⚠️ **Not for production**: This is temporary storage only
- 🔄 **Sync with Supabase**: Files should be uploaded to Supabase Storage
- 🗑️ **Cleanup**: Old files should be periodically cleaned up
- 📁 **Git ignored**: This directory is excluded from version control

## Migration to Supabase
When moving to production:
1. Upload files to Supabase Storage
2. Update database records with Supabase URLs
3. Remove local files from this directory
4. Configure Supabase as primary storage
