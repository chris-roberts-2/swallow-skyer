import React from 'react';
import PhotoMapLive from '../PhotoMapLive';
import ProjectSwitcher from '../components/projects/ProjectSwitcher';

const MapPage = () => (
  <div className="map-page">
    <ProjectSwitcher />
    <PhotoMapLive />
  </div>
);

export default MapPage;
