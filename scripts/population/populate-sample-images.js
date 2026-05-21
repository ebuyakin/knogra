/**
 * Populate knogra-graph with sample background images
 * 
 * HOW TO RUN:
 * Import this in main.ts temporarily:
 *   import { populateSampleImages } from './storage/populate-sample-images.js';
 *   await populateSampleImages();
 */

import Dexie from 'dexie';

// Helper to convert image file to base64 dataUri with resizing
async function imageToDataUri(imagePath, maxWidth = 1920, maxHeight = 1080) {
  const response = await fetch(imagePath);
  const blob = await response.blob();
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate resize dimensions
      let width = img.width;
      let height = img.height;
      
      // Only resize if image is larger than max dimensions
      if (width > maxWidth || height > maxHeight) {
        const aspectRatio = width / height;
        
        if (width > height) {
          width = maxWidth;
          height = width / aspectRatio;
        } else {
          height = maxHeight;
          width = height * aspectRatio;
        }
        
        console.log(`   Resizing from ${img.width}x${img.height} to ${Math.round(width)}x${Math.round(height)}`);
      }
      
      // Create canvas and resize
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to dataUri with quality
      const dataUri = canvas.toDataURL('image/jpeg', 0.85);
      resolve(dataUri);
    };
    img.onerror = reject;
    
    // Create object URL from blob
    const reader = new FileReader();
    reader.onloadend = () => {
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper to get image dimensions
async function getImageDimensions(dataUri) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.src = dataUri;
  });
}

// Helper to create gradient image
function createGradientImage(width, height, color1, color2, direction = 'vertical') {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  const gradient = direction === 'vertical'
    ? ctx.createLinearGradient(0, 0, 0, height)
    : ctx.createLinearGradient(0, 0, width, 0);
  
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  return canvas.toDataURL('image/png');
}

export async function populateSampleImages() {
  console.log('🖼️  Populating background images...');

  const db = new Dexie('knogra-graph');
  db.version(2).stores({
    nodes: '++id, title, tags',
    edges: '++id, title, sourceId, targetId, tags',
    views: '++id, title',
    backgroundImages: '++id, name'
  });

  try {
    await db.open();

    // Clear existing images
    await db.backgroundImages.clear();
    console.log('✅ Cleared existing background images');

    // Load real images from guides folder
    console.log('📥 Loading real images...');
    
    const img1Path = '/guides/IMG_2447.jpg';
    const img1DataUri = await imageToDataUri(img1Path);
    const img1Dimensions = await getImageDimensions(img1DataUri);
    console.log(`   IMG_2447.jpg: ${img1Dimensions.width}x${img1Dimensions.height}`);

    const img2Path = '/guides/IMG_2.png';
    const img2DataUri = await imageToDataUri(img2Path);
    const img2Dimensions = await getImageDimensions(img2DataUri);
    console.log(`   IMG_2.png: ${img2Dimensions.width}x${img2Dimensions.height}`);

    // Create gradient images
    console.log('🎨 Creating gradient images...');
    const blueGradient = createGradientImage(1200, 800, '#1e3a8a', '#3b82f6', 'vertical');
    const orangeGradient = createGradientImage(1200, 800, '#9a3412', '#fb923c', 'horizontal');

    // Create sample background images
    const images = [
      {
        id: 'bg-1',
        name: 'Photo 1 (IMG_2447)',
        dataUri: img1DataUri,
        width: img1Dimensions.width,
        height: img1Dimensions.height,
        createdAt: new Date('2024-01-15')
      },
      {
        id: 'bg-2',
        name: 'Photo 2 (IMG_2)',
        dataUri: img2DataUri,
        width: img2Dimensions.width,
        height: img2Dimensions.height,
        createdAt: new Date('2024-01-16')
      },
      {
        id: 'bg-3',
        name: 'Blue Gradient',
        dataUri: blueGradient,
        width: 1200,
        height: 800,
        createdAt: new Date('2024-01-17')
      },
      {
        id: 'bg-4',
        name: 'Orange Gradient',
        dataUri: orangeGradient,
        width: 1200,
        height: 800,
        createdAt: new Date('2024-01-18')
      }
    ];

    // Insert images
    for (const image of images) {
      await db.backgroundImages.add(image);
    }

    console.log('✅ Added sample background images:', images.length);
    console.log(`   - bg-1: Photo 1 (${img1Dimensions.width}x${img1Dimensions.height})`);
    console.log(`   - bg-2: Photo 2 (${img2Dimensions.width}x${img2Dimensions.height})`);
    console.log('   - bg-3: Blue Gradient (1200x800)');
    console.log('   - bg-4: Orange Gradient (1200x800)');

    await db.close();
    console.log('🎉 Sample images populated successfully!');

  } catch (error) {
    console.error('❌ Error populating images:', error);
    throw error;
  }
}
