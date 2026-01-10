# MapLibre Node Components

## Purpose

This directory contains MapLibre-specific node logic for scalable map interaction and photo management. It is **frontend source code** that is bundled into the static site build (`client/build/`).

## Components

### NodeManager.js

Central manager for map nodes, handles:

- Node creation and deletion
- Photo stacking at coordinates
- Node state management
- Event handling

### PhotoNode.js

Individual photo node component:

- Photo marker rendering
- Click/touch interactions
- Visual state management
- Animation handling

### NodeCluster.js

Clustering logic for nearby nodes:

- Distance-based clustering
- Cluster visualization
- Expand/collapse functionality
- Performance optimization

### NodeEvents.js

Event handling for map interactions:

- Click events
- Hover effects
- Drag and drop
- Touch gestures

## Usage

```javascript
import { NodeManager, PhotoNode, NodeCluster } from './nodes';

// Initialize node manager
const nodeManager = new NodeManager(mapInstance);

// Add photo node
nodeManager.addPhotoNode(photoData, coordinates);

// Handle clustering
const cluster = new NodeCluster(nodes, options);
```
