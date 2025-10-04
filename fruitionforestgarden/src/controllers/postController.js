import { processImage, Post } from '@ffg/blog-core';
import { promises as fs } from 'fs';
import path from 'path';
import sanitizeHtml from 'sanitize-html';

export const createPost = async (req, res) => {
  try {
    console.log('Controller: createPost called');
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    console.log('Session:', req.session);
    
    // Validate required fields
    if (!req.body.title || !req.body.body) {
      console.error('Missing required fields');
      req.flash('error', 'Title and content are required');
      return res.redirect('/admin/posts/new');
    }

    let imagesArray = [];
    // Process images if uploaded
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const imageUrls = await processImage(file.path, file.filename);
          imagesArray.push(imageUrls);
        } catch (imgErr) {
          console.error('Error processing image:', imgErr);
        }
      }
      console.log('Processed images array:', imagesArray);
    }

    // Create the post
    let result;
    try {
      let captions = Array.isArray(req.body['captions[]']) ? req.body['captions[]'] : (req.body['captions[]'] ? [req.body['captions[]']] : []);
      // Filter out empty captions
      captions = captions.filter(c => c && c.trim() !== '');
      result = Post.create({
      title: req.body.title,
      body: sanitizeHtml(req.body.body, { allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h2', 'h3', 'u']), allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ['src', 'alt', 'title', 'width', 'height', 'style'] } }),
      description: req.body.description || '',
      excerpt: req.body.excerpt || '',
      images: imagesArray,
      captions: captions,
      created_at: req.body.created_at || undefined
    });
    console.log('Post creation result:', result);
    } catch (createErr) {
      console.error('Error during Post.create:', createErr);
      req.flash('error', 'Failed to create post - error in Post.create');
      return res.redirect('/admin/posts/new');
    }

    if (!result.changes || result.changes === 0) {
      console.error('Post creation failed - no changes');
      req.flash('error', 'Failed to create post - no changes');
      return res.redirect('/admin/posts/new');
    }

    // Get the newly created post
    let post;
    try {
      post = Post.findById(result.lastInsertRowid);
    console.log('Created post:', post);
    } catch (findErr) {
      console.error('Error during Post.findById:', findErr);
      req.flash('error', 'Post created but could not be retrieved (findById error)');
      return res.redirect('/admin');
    }

    if (!post) {
      console.error('Post creation succeeded but post not found');
      req.flash('error', 'Post created but could not be retrieved');
      return res.redirect('/admin');
    }

    // Success!
    req.flash('success', 'Post created successfully');

    // Assign categories to the post
    const categoryIds = Array.isArray(req.body.categories) ? req.body.categories : (req.body.categories ? [req.body.categories] : []);
    if (categoryIds.length && post && post.id) {
      for (const categoryId of categoryIds) {
        Post.addCategory(post.id, categoryId);
      }
      console.log('Assigned categories to post:', post.id, categoryIds);
      console.log('Categories now linked:', Post.getCategories(post.id));
    }

    res.redirect(`/admin/posts/${post.id}/edit`);

  } catch (error) {
    console.error('Error in createPost controller:', error);
    req.flash('error', `Error creating post: ${error.message}`);
    res.redirect('/admin/posts/new');
  }
};

export const updatePost = async (req, res) => {
  try {
    console.log('updatePost body:', req.body);
    console.log('updatePost file:', req.file);
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      req.flash('error', 'Post not found');
      return res.redirect('/admin');
    }

    let imageUrls = post.images || [];
    // Ensure imageUrls is an array
    if (!Array.isArray(imageUrls)) {
      imageUrls = [];
    }

    // Process new images if uploaded
    if (req.files && req.files.length > 0) {
      // Delete old images if they exist
      if (post.images && Array.isArray(post.images)) {
        for (const imageObj of post.images) {
          if (imageObj && imageObj.thumbnail) {
            try {
              await fs.unlink(path.join(process.cwd(), 'src/public', imageObj.thumbnail));
            } catch (error) {
              console.error('Error deleting old image:', error);
            }
          }
        }
      }
      // Add new images
      imageUrls = [];
      for (const file of req.files) {
        const newImageUrls = await processImage(file.path, file.filename);
        imageUrls.push(newImageUrls);
      }
    }

    // Get captions from form
    let captions = Array.isArray(req.body['captions[]']) ? req.body['captions[]'] : (req.body['captions[]'] ? [req.body['captions[]']] : []);
    // If not found, try req.body.captions
    if (!captions.length && req.body.captions) {
      captions = Array.isArray(req.body.captions) ? req.body.captions : [req.body.captions];
    }
    // Pad or trim captions to match images length
    if (captions.length < imageUrls.length) {
      while (captions.length < imageUrls.length) captions.push('');
    } else if (captions.length > imageUrls.length) {
      captions = captions.slice(0, imageUrls.length);
    }

    await Post.update(req.params.id, {
      title: req.body.title,
      body: sanitizeHtml(req.body.body, { allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h2', 'h3', 'u']), allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ['src', 'alt', 'title', 'width', 'height', 'style'] } }),
      description: req.body.description || '',
      excerpt: req.body.excerpt || '',
      images: imageUrls,
      captions: captions,
      created_at: req.body.created_at || undefined
    });

    // Update categories for the post
    const categoryIds = Array.isArray(req.body.categories) ? req.body.categories : (req.body.categories ? [req.body.categories] : []);
    // Remove all existing categories
    const existingCategories = Post.getCategories(post.id);
    if (existingCategories && existingCategories.length) {
      for (const cat of existingCategories) {
        Post.removeCategory(post.id, cat.id);
      }
    }
    // Add new categories
    if (categoryIds.length) {
      for (const categoryId of categoryIds) {
        Post.addCategory(post.id, categoryId);
      }
      console.log('Updated categories for post:', post.id, categoryIds);
      console.log('Categories now linked:', Post.getCategories(post.id));
    }

    req.flash('success', 'Post updated successfully');
    res.redirect(`/admin/posts/${req.params.id}/edit`);
  } catch (error) {
    // Clean up any uploaded files if there was an error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }
    
    console.error('Error updating post:', error);
    req.flash('error', 'Error updating post');
    res.redirect(`/admin/posts/${req.params.id}/edit`);
  }
};

// Add other controller methods as needed

export default {
    createPost,
    updatePost
}; 