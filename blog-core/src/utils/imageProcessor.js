// Temporarily disable Sharp processing to get containers running
// TODO: Fix Sharp installation for Alpine Linux

const IMAGE_SIZES = {
  thumbnail: { maxWidth: 400, maxHeight: 400 },
  medium: { maxWidth: 800, maxHeight: 800 },
  large: { maxWidth: 1920, maxHeight: 1920 }
};

export const processImage = async (inputPath, filename, outputDir) => {
  console.log('Image processing temporarily disabled - Sharp installation issue');
  
  // Return placeholder data to prevent errors
  return {
    thumbnail: '/uploads/placeholder-thumbnail.jpg',
    medium: '/uploads/placeholder-medium.jpg', 
    large: '/uploads/placeholder-large.jpg',
    originalWidth: 800,
    originalHeight: 600,
    originalAspectRatio: 1.33
  };
};

export { IMAGE_SIZES };

