import PhotoNode from './PhotoNode';
import NodeCluster from './NodeCluster';
import NodeEvents from './NodeEvents';

class NodeManager {
  constructor(mapInstance) {
    this.map = mapInstance;
    this.nodes = new Map();
    this.clusters = new Map();
    this.events = new NodeEvents(this);
  }

  // Add a photo node to the map
  addPhotoNode(photo, coordinates) {
    const nodeId = this.generateNodeId(coordinates);
    const photoNode = new PhotoNode(photo, coordinates, nodeId);
    
    this.nodes.set(nodeId, photoNode);
    this.renderNode(photoNode);
    
    // Check for clustering
    this.updateClusters(coordinates);
    
    return photoNode;
  }

  // Remove a photo node
  removePhotoNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.remove();
      this.nodes.delete(nodeId);
      this.updateClusters();
    }
  }

  // Update photo stack at coordinates
  updatePhotoStack(coordinates, photos) {
    const nodeId = this.generateNodeId(coordinates);
    const existingNode = this.nodes.get(nodeId);
    
    if (existingNode) {
      existingNode.updatePhotos(photos);
    } else if (photos.length > 0) {
      this.addPhotoNode(photos[0], coordinates);
    }
  }

  // Generate unique node ID based on coordinates
  generateNodeId(coordinates) {
    const { latitude, longitude } = coordinates;
    return `node_${latitude.toFixed(4)}_${longitude.toFixed(4)}`;
  }

  // Render node on map
  renderNode(photoNode) {
    // Implementation for rendering node on MapLibre
    const marker = this.createMarker(photoNode);
    photoNode.setMarker(marker);
  }

  // Create MapLibre marker
  createMarker(photoNode) {
    // MapLibre marker creation logic
    return {
      id: photoNode.id,
      coordinates: photoNode.coordinates,
      element: photoNode.getElement()
    };
  }

  // Update clustering based on zoom level and node density
  updateClusters(centerCoordinates = null) {
    const zoom = this.map.getZoom();
    const shouldCluster = zoom < 10; // Cluster when zoomed out
    
    if (shouldCluster) {
      this.createClusters(centerCoordinates);
    } else {
      this.removeClusters();
    }
  }

  // Create clusters for nearby nodes
  createClusters(centerCoordinates = null) {
    // Clustering logic implementation
    const nodes = Array.from(this.nodes.values());
    const cluster = new NodeCluster(nodes, {
      maxZoom: 10,
      radius: 50
    });
    
    this.clusters.set('main', cluster);
    cluster.render(this.map);
  }

  // Remove all clusters
  removeClusters() {
    this.clusters.forEach(cluster => cluster.remove());
    this.clusters.clear();
  }

  // Get all nodes
  getAllNodes() {
    return Array.from(this.nodes.values());
  }

  // Get nodes by coordinates
  getNodesByCoordinates(coordinates, radius = 0.001) {
    return this.getAllNodes().filter(node => 
      this.isWithinRadius(node.coordinates, coordinates, radius)
    );
  }

  // Check if coordinates are within radius
  isWithinRadius(coord1, coord2, radius) {
    const latDiff = Math.abs(coord1.latitude - coord2.latitude);
    const lngDiff = Math.abs(coord1.longitude - coord2.longitude);
    return latDiff <= radius && lngDiff <= radius;
  }

  // Cleanup
  destroy() {
    this.nodes.forEach(node => node.remove());
    this.removeClusters();
    this.events.destroy();
  }
}

export default NodeManager;
