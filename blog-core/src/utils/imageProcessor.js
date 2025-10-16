import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

const IMAGE_SIZES = {
  thumbnail: { maxWidth: 400, maxHeight: 400 },
  medium: { maxWidth: 800, maxHeight: 800 },
  large: { maxWidth: 1920, maxHeight: 1920 }
};

export const processImage = async (inputPath, filename, outputDir) => {
  try {
    console.log('Processing image:', { inputPath, filename, outputDir });
    
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    // Get image metadata
    const metadata = await sharp(inputPath).metadata();
    const { width, height } = metadata;
    const aspectRatio = width / height;
    
    // Generate base filename without extension
    const baseFilename = path.parse(filename).name;
    
    const results = {};
    
    // Process each size
    for (const [sizeName, { maxWidth, maxHeight }] of Object.entries(IMAGE_SIZES)) {
      const outputFilename = `${baseFilename}-${sizeName}.jpg`;
      const outputPath = path.join(outputDir, outputFilename);
      
      // Resize image maintaining aspect ratio
      await sharp(inputPath)
        .resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85 })
        .toFile(outputPath);
      
      // Store relative path for web access
      results[sizeName] = `/uploads/${outputFilename}`;
    }
    
    // Add metadata
    results.originalWidth = width;
    results.originalHeight = height;
    results.originalAspectRatio = aspectRatio;
    
    console.log('Image processing completed:', results);
    return results;
    
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
};

export { IMAGE_SIZES };

