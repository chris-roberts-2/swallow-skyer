import React from 'react';

class PhotoNode {
  constructor(photo, coordinates, nodeId) {
    this.id = nodeId;
    this.photo = photo;
    this.coordinates = coordinates;
    this.photos = [photo];
    this.marker = null;
    this.isActive = false;
    this.isVisible = true;
  }

  // Add photo to this node's stack
  addPhoto(photo) {
    this.photos.push(photo);
    this.updateDisplay();
  }

  // Remove photo from stack
  removePhoto(photoId) {
    this.photos = this.photos.filter(p => p.id !== photoId);
    this.updateDisplay();
  }

  // Update all photos in this node
  updatePhotos(photos) {
    this.photos = photos;
    this.updateDisplay();
  }

  // Set the MapLibre marker
  setMarker(marker) {
    this.marker = marker;
  }

  // Get the number of photos at this node
  getPhotoCount() {
    return this.photos.length;
  }

  // Get the primary photo (first in stack)
  getPrimaryPhoto() {
    return this.photos[0];
  }

  // Set active state
  setActive(active) {
    this.isActive = active;
    this.updateDisplay();
  }

  // Set visibility
  setVisible(visible) {
    this.isVisible = visible;
    if (this.marker) {
      this.marker.setVisible(visible);
    }
  }

  // Update the visual display
  updateDisplay() {
    if (this.marker) {
      // Update marker appearance based on photo count and state
      const element = this.marker.getElement();
      if (element) {
        this.updateMarkerElement(element);
      }
    }
  }

  // Update marker DOM element
  updateMarkerElement(element) {
    const countElement = element.querySelector('.photo-count');
    if (countElement) {
      countElement.textContent = this.getPhotoCount();
    }

    // Update active state styling
    element.classList.toggle('active', this.isActive);
    element.classList.toggle('has-multiple', this.getPhotoCount() > 1);
  }

  // Get React element for rendering
  getElement() {
    return (
      <div className={`photo-node ${this.isActive ? 'active' : ''}`}>
        <div className="node-pin">
          <span className="photo-count">{this.getPhotoCount()}</span>
        </div>
        {this.getPhotoCount() > 1 && <div className="stack-indicator">+</div>}
      </div>
    );
  }

  // Handle click events
  onClick(callback) {
    if (this.marker) {
      this.marker.on('click', callback);
    }
  }

  // Handle hover events
  onHover(callback) {
    if (this.marker) {
      this.marker.on('mouseenter', callback);
      this.marker.on('mouseleave', callback);
    }
  }

  // Remove the node from map
  remove() {
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
  }

  // Get node data for serialization
  toJSON() {
    return {
      id: this.id,
      coordinates: this.coordinates,
      photos: this.photos,
      isActive: this.isActive,
      isVisible: this.isVisible,
    };
  }
}

export default PhotoNode;
