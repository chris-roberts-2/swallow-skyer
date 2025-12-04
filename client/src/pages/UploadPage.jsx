import React from 'react';
import BatchUploader from '../components/upload/BatchUploader';

const UploadPage = () => (
  <div className="upload-page">
    <h2>Upload Photos</h2>
    <p>Submit new aerial photos to add them to the shared library.</p>
    <BatchUploader />
  </div>
);

export default UploadPage;
