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
  const ext = path.extname(filename).toLowerCase();
  const basename = path.basename(filename, ext);
  
  try {
    // Check for HEIF files and provide helpful error
    if (ext === '.heif' || ext === '.heic') {
      const error = new Error(`HEIF/HEIC files are not supported. Please convert "${filename}" to JPEG or PNG before uploading. You can use Preview (on Mac) or any online converter.`);
      error.code = 'HEIF_NOT_SUPPORTED';
      throw error;
    }

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    const processedImages = {};
    
    // Try to get metadata, but handle HEIF errors gracefully
    let metadata;
    try {
      metadata = await sharp(inputPath).metadata();
    } catch (sharpError) {
      // If Sharp fails to read metadata, it might be a HEIF file that wasn't caught by extension check
      if (sharpError.message.includes('heif') || sharpError.message.includes('HEIF')) {
        const error = new Error(`HEIF/HEIC files are not supported. Please convert "${filename}" to JPEG or PNG before uploading. You can use Preview (on Mac) or any online converter.`);
        error.code = 'HEIF_NOT_SUPPORTED';
        throw error;
      }
      throw sharpError;
    }

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
    processedImages.originalAspectRatio = metadata.width / metadata.height;

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