import React from 'react';
import './PageLayout.css';

/**
 * PageLayout — shared authenticated page frame.
 * Wraps page content with consistent horizontal margins,
 * max-width containment, and vertical padding.
 */
const PageLayout = ({ children }) => (
  <div className="page-layout">
    <div className="page-layout__inner">{children}</div>
  </div>
);

export default PageLayout;
