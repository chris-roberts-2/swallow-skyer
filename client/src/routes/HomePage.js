import React from 'react';
import { Link } from 'react-router-dom';

const HomePage = () => {
  return (
    <div className="home-page">
      <h1>Welcome to Swallow Skyer</h1>
      <p>
        A platform for storing and managing photos on a map based on GPS
        coordinates.
      </p>
      <p>
        Upload photos with location data and explore them on an interactive map.
      </p>

      <div className="home-actions">
        <Link to="/map" className="btn btn-primary">
          View Map
        </Link>
        <Link to="/upload" className="btn btn-secondary">
          Upload Photo
        </Link>
      </div>
    </div>
  );
};

export default HomePage;
