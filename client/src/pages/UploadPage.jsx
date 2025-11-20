import React from 'react';
import UploadForm from '../components/UploadForm';

const UploadPage = () => (
  <div className="upload-page">
    <h2>Upload Photos</h2>
    <p>Submit new aerial photos to add them to the shared library.</p>
    <UploadForm />
  </div>
);

export default UploadPage;
