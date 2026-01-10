import React, { useState } from 'react';

const PhotoUpload = ({ onUpload, location }) => {
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = e => {
    setFile(e.target.files[0]);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!file || !location) return;

    setIsUploading(true);
    try {
      await onUpload(file, caption, location);
      setFile(null);
      setCaption('');
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="photo-upload">
      <div className="upload-section">
        <input
          data-testid="photo-file-input"
          aria-label="Photo file"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="file-input"
        />
        <input
          type="text"
          placeholder="Add a caption..."
          value={caption}
          onChange={e => setCaption(e.target.value)}
          className="caption-input"
        />
      </div>
      <button
        type="submit"
        disabled={!file || isUploading}
        className="upload-btn"
      >
        {isUploading ? 'Uploading...' : 'Upload Photo'}
      </button>
    </form>
  );
};

export default PhotoUpload;
