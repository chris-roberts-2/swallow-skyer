import React from 'react';
import { Link } from 'react-router-dom';
import BatchUploader from '../components/upload/BatchUploader';
import { useAuth } from '../context';

const UploadPage = () => {
  const { activeProject } = useAuth();
  const hasActiveProject = !!(activeProject?.id || activeProject);

  if (!hasActiveProject) {
    return (
      <div className="upload-page">
        <h2>Upload Photos</h2>
        <p>Select or create a project before uploading.</p>
        <Link to="/projects">Go to Projects</Link>
      </div>
    );
  }

  return (
    <div className="upload-page">
      <h2>Upload Photos</h2>
      <p>Submit new aerial photos to add them to the shared library.</p>
      <BatchUploader />
    </div>
  );
};

export default UploadPage;
