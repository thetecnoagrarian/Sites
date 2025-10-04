# Admin User Guide

This guide explains how to use the admin features of the Fruition Forest Garden blog system.

## Getting Started

1. **Login**: Access the admin panel at `/admin/login`
2. **Default Credentials**: 
   - Username: `admin`
   - Password: `admin123`
3. **Change Password**: Update your password immediately after first login

## Creating Posts

### Basic Post Creation
1. Navigate to "New Post" from the admin dashboard
2. Fill out the form:
   - **Title**: The post title (required)
   - **Description**: Brief description for SEO
   - **Excerpt**: Short summary for post previews
   - **Body**: Main post content (supports HTML)
   - **Images**: Upload multiple images (optional)
   - **Captions**: Add captions for each image
   - **Categories**: Select relevant categories
   - **Created Date**: Set custom date (defaults to today)

### Duplicate Title Handling

When you create a post with a title that already exists:

1. **Detection**: The system automatically detects the duplicate
2. **Confirmation Page**: You'll see a side-by-side comparison:
   - **Left side**: Existing post details
   - **Right side**: Your new post content
3. **Choose Action**:
   - **Overwrite**: Replace the existing post with your new content
   - **Cancel**: Go back and change the title

#### What Happens When You Overwrite:
- The existing post is updated with your new content
- The creation date is updated to reflect when the new content was created
- The post will appear in the correct chronological order on the dashboard
- All images, categories, and content are replaced

## Image Management

### Supported Formats
- **JPEG/JPG**: Fully supported
- **PNG**: Fully supported
- **WebP**: Supported
- **GIF**: Supported

### Unsupported Formats
- **HEIF/HEIC**: Not supported (common on newer iPhones)

#### What Happens with Unsupported Images:
1. **Clear Error Message**: You'll see a helpful message explaining the issue
2. **Conversion Instructions**: Step-by-step guide on how to convert the image
3. **No Post Creation**: The post won't be created until you fix the image issue

#### How to Convert HEIF/HEIC Images:
- **Mac**: Open in Preview → File → Export As → Choose JPEG or PNG
- **Windows**: Use Photos app → Edit → Save As → Choose JPEG or PNG
- **Online**: Use any online converter (search "HEIF to JPEG converter")

### Image Processing
When you upload images, the system automatically:
- **Resizes**: Creates thumbnail (400x400), medium (800x800), and large (1920x1920) versions
- **Optimizes**: Compresses images for web use
- **Organizes**: Stores all versions in the uploads folder
- **Links**: Automatically links images to your post

## URL Management

### Automatic Slug Generation
- **Unique URLs**: Every post gets a unique, SEO-friendly URL
- **Conflict Resolution**: If two posts have the same title, the system adds numbers:
  - "My Post" → `/post/my-post`
  - "My Post" (duplicate) → `/post/my-post-1`
  - "My Post" (another duplicate) → `/post/my-post-2`

### URL Structure
- **Format**: `/post/[slug]`
- **Examples**:
  - "Building Our Cabin" → `/post/building-our-cabin`
  - "Solar Power Setup" → `/post/solar-power-setup`

## Managing Categories

### Creating Categories
1. Go to the Categories section in admin
2. Add new categories as needed
3. Categories help organize posts and improve navigation

### Assigning Categories
- Select one or more categories when creating/editing posts
- Categories appear on the post and in category listings
- Helps visitors find related content

## Dashboard Features

### Post Management
- **View All Posts**: See all posts with creation dates
- **Edit Posts**: Click on any post to edit it
- **Delete Posts**: Remove posts you no longer need
- **Search**: Find posts quickly using the search function

### Analytics
- **Page Views**: See which posts are most popular
- **Visitor Data**: Basic analytics about site traffic
- **Performance**: Monitor site performance metrics

## Best Practices

### Content Creation
1. **Use Descriptive Titles**: Clear, specific titles work best
2. **Add Descriptions**: Help with SEO and social media sharing
3. **Include Images**: Visual content improves engagement
4. **Categorize Properly**: Makes content easier to find

### Image Optimization
1. **Use Web-Friendly Formats**: JPEG for photos, PNG for graphics
2. **Optimize Before Upload**: Compress large images before uploading
3. **Add Captions**: Provide context for your images
4. **Test on Mobile**: Ensure images look good on all devices

### SEO Tips
1. **Unique Titles**: Avoid duplicate titles when possible
2. **Descriptive URLs**: The system creates SEO-friendly URLs automatically
3. **Categories**: Use categories to organize content
4. **Regular Updates**: Keep content fresh and current

## Troubleshooting

### Common Issues

#### "Post with this title already exists"
- **Solution**: Use the overwrite feature or change the title
- **Prevention**: Check existing posts before creating new ones

#### "HEIF/HEIC files not supported"
- **Solution**: Convert the image to JPEG or PNG
- **Prevention**: Check image format before uploading

#### "Images not displaying"
- **Check**: File format and size
- **Solution**: Re-upload in supported format

#### "Post not appearing on dashboard"
- **Check**: Creation date - posts are ordered by date
- **Solution**: Look further down the list if using an older date

### Getting Help
- Check the error messages - they usually explain what went wrong
- Look at the logs for technical details
- Contact the developer if issues persist

## Security Notes

- **Change Default Password**: Update admin password immediately
- **Regular Backups**: The system reminds you to backup regularly
- **Session Management**: Log out when finished
- **File Uploads**: Only upload images - other file types are blocked

