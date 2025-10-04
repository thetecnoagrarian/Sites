const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

const IMAGE_SIZES = {
  thumbnail: { maxWidth: 400, maxHeight: 400 },
  medium: { maxWidth: 800, maxHeight: 800 },
  large: { maxWidth: 1920, maxHeight: 1920 }
};

const processImage = async (inputPath, filename) => {
  const outputDir = path.join(process.cwd(), 'src/public/uploads');
  const ext = path.extname(filename);
  const basename = path.basename(filename, ext);
  
  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    const processedImages = {};
    const metadata = await sharp(inputPath).metadata();

    // Process each size
    for (const [size, dimensions] of Object.entries(IMAGE_SIZES)) {
      const { maxWidth, maxHeight } = dimensions;
      
      // Calculate dimensions maintaining aspect ratio
      let width = metadata.width;
      let height = metadata.height;
      
      // Scale down if image exceeds max dimensions
      if (width > maxWidth || height > maxHeight) {
        const aspectRatio = width / height;
        if (width > height) {
          // Landscape
          width = Math.min(width, maxWidth);
          height = Math.round(width / aspectRatio);
          
          // Check if height still exceeds maxHeight
          if (height > maxHeight) {
            height = maxHeight;
            width = Math.round(height * aspectRatio);
          }
        } else {
          // Portrait
          height = Math.min(height, maxHeight);
          width = Math.round(height * aspectRatio);
          
          // Check if width still exceeds maxWidth
          if (width > maxWidth) {
            width = maxWidth;
            height = Math.round(width / aspectRatio);
          }
        }
      }

      const outputFilename = `${basename}-${size}${ext}`;
      const outputPath = path.join(outputDir, outputFilename);

      await sharp(inputPath)
        .resize(width, height, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85, progressive: true })
        .toFile(outputPath);

      processedImages[size] = `/uploads/${outputFilename}`;
    }

    // Store original dimensions
    processedImages.originalWidth = metadata.width;
    processedImages.originalHeight = metadata.height;
    processedImages.aspectRatio = metadata.width / metadata.height;

    // Delete original file
    await fs.unlink(inputPath);

    return processedImages;
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
};

module.exports = {
  processImage,
  IMAGE_SIZES
}; 