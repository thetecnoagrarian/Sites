# Hero Image Management Feature Plan

## Overview
Add a dedicated section in the admin dashboard to upload and manage hero images. The system will automatically process images (resize and optimize) using Sharp during upload, similar to how post images are handled.

---

## Current State Analysis

### Hero Image Usage
- **FFG**: `/images/HeroCamp.png` (19MB, 4000x3000px) - hardcoded in `home.hbs`
- **TTA**: `/images/Hero.png` - hardcoded in `home.hbs`
- **OG Tags**: FFG uses `/images/HeroCamp-og.png` (1.8MB, 1200x900px) for social sharing

### Existing Infrastructure
- ✅ Multer configured for file uploads (`src/middleware/upload.js`)
- ✅ Sharp image processing (`src/utils/imageProcessor.js`)
- ✅ Admin dashboard exists (`src/routes/admin.js`, `src/views/admin/dashboard.hbs`)
- ✅ Image storage: `src/public/images/` directory

---

## Requirements

### Functional Requirements
1. **Upload Interface**: Admin section to upload new hero images
2. **Automatic Processing**: 
   - Resize to optimal dimensions (e.g., max 1920px width, maintain aspect ratio)
   - Compress to reduce file size (target: < 2MB for web, < 1MB for OG)
   - Generate two versions:
     - Full-size hero image (for homepage display)
     - OG-optimized version (for social sharing, 1200x630px recommended)
3. **File Management**: 
   - Replace old hero image when new one is uploaded
   - Store with consistent naming: `HeroCamp.png` and `HeroCamp-og.png`
4. **Display**: Show current hero image in admin with preview
5. **Dynamic Loading**: Update `home.hbs` to use dynamic hero image path

### Technical Requirements
- Use existing Multer middleware for upload handling
- Use existing Sharp processing (extend `imageProcessor.js` or create hero-specific processor)
- Store processed images in `src/public/images/`
- Update OG tags middleware to use processed OG image
- Only FFG needs this feature (not TTA)

---

## Implementation Plan

### Phase 1: Backend Infrastructure

#### 1.1 Create Hero Image Processor
**File**: `src/utils/heroImageProcessor.js` (or extend existing `imageProcessor.js`)

**Functionality**:
- Accept uploaded image file
- Process two versions:
  - **Hero Image**: Max 1920px width, maintain aspect ratio, optimize to < 2MB
  - **OG Image**: Resize to 1200x630px (Facebook recommended), optimize to < 1MB
- Save as:
  - `HeroCamp.webp` - full hero image
  - `HeroCamp-og.webp` - OG optimized
- Delete old hero images before saving new ones
- Return file paths for database/storage

**Sharp Processing**:
```javascript
// Hero image: max 1920px width, quality 85, WebP format
// OG image: 1200x630px (crop to fit if needed), quality 80, WebP format
```

#### 1.2 Create Hero Image Storage/Model
**Option A**: Simple file-based (recommended for MVP)
- Store hero image filename in a simple config file or environment variable
- Or: Check if `HeroCamp.png` exists, use it

**Option B**: Database table
- Create `hero_images` table with columns: `id`, `filename`, `og_filename`, `uploaded_at`, `site`
- Store current hero image reference

**Recommendation**: **Option A** - File-based is simpler. Just check for `HeroCamp.png` / `Hero.png` existence.

#### 1.3 Admin Routes
**File**: `src/routes/admin.js`

**New Routes**:
- `GET /admin/hero-image` - Display hero image management page
- `POST /admin/hero-image/upload` - Handle hero image upload
  - Use Multer middleware (single file, field name: `heroImage`)
  - Process with hero image processor
  - Replace old images
  - Redirect with success/error message

**Middleware**:
- Use existing `isAuthenticated` and `isAdmin`
- Use existing Multer upload middleware (may need hero-specific config)

---

### Phase 2: Frontend Interface

#### 2.1 Admin View Template
**File**: `src/views/admin/hero-image.hbs`

**Features**:
- Display current hero image (if exists) with preview
- Upload form with file input
- Show file size and dimensions after upload
- Success/error messages
- Link from admin dashboard

**UI Elements**:
- Current hero image preview (if exists)
- File upload input (accept: image/jpeg, image/png)
- Upload button
- File size warning (e.g., "Large images will be automatically optimized")
- Processing status indicator

#### 2.2 Update Admin Dashboard
**File**: `src/views/admin/dashboard.hbs`

**Changes**:
- Add "Hero Image" section/link in navigation or sidebar
- Quick preview of current hero image (thumbnail)

---

### Phase 3: Dynamic Hero Image Loading

#### 3.1 Update Homepage Templates
**Files**: 
- `fruitionforestgarden/src/views/home.hbs`
- `thetecnoagrarian/src/views/home.hbs`

**Changes**:
- Replace hardcoded `/images/HeroCamp.png` with dynamic path
- Use helper function or pass from route handler
- Fallback to default if hero image doesn't exist

**Implementation Options**:
1. **Route Handler**: Pass `heroImagePath` from route to template
2. **Helper Function**: Create Handlebars helper to check for hero image
3. **Middleware**: Set `res.locals.heroImagePath` in middleware

**Recommendation**: **Route Handler** - simplest and most explicit

#### 3.2 Update Route Handlers
**Files**:
- `fruitionforestgarden/src/routes/home.js`
- `thetecnoagrarian/src/routes/home.js`

**Changes**:
- Check if hero image exists (`HeroCamp.png` or `Hero.png`)
- Pass `heroImagePath` to template (or `null` if doesn't exist)
- Template uses: `{{#if heroImagePath}}<img src="{{heroImagePath}}">...{{/if}}`

---

### Phase 4: OG Tags Integration

#### 4.1 Update OG Tags Middleware
**Files**:
- `fruitionforestgarden/src/middleware/ogTags.js`
- `thetecnoagrarian/src/middleware/ogTags.js`

**Changes**:
- Check for `HeroCamp-og.png` (or `Hero-og.png` for TTA) instead of hardcoded path
- Fallback to full hero image if OG version doesn't exist
- Use dynamic path based on site

---

## File Structure

```
fruitionforestgarden/
  src/
    routes/
      admin.js                    # Add hero image routes
    utils/
      heroImageProcessor.js       # NEW: Hero image processing
    views/
      admin/
        hero-image.hbs            # NEW: Hero image management page
        dashboard.hbs             # Update: Add hero image link
      home.hbs                    # Update: Use dynamic hero image
    middleware/
      ogTags.js                   # Update: Use dynamic OG image path
```

---

## Technical Specifications

### Hero Image Processing
- **Input**: Any image format (JPEG, PNG, GIF)
- **Output Format**: WebP (for optimal compression and quality)
- **Hero Image**: 
  - Max width: 1920px
  - Maintain aspect ratio
  - Quality: 85
  - Target size: < 2MB
- **OG Image**:
  - Dimensions: 1200x630px (Facebook recommended)
  - Crop to fit if needed (center crop)
  - Quality: 80
  - Target size: < 1MB

### File Naming
- **FFG Only**: 
  - Hero: `HeroCamp.webp`
  - OG: `HeroCamp-og.webp`

### Storage Location
- `src/public/images/` (same as current)

---

## Implementation Steps

1. ✅ **Create hero image processor utility**
   - Extend Sharp processing for hero-specific sizes
   - Handle both hero and OG versions

2. ✅ **Add admin routes**
   - GET route for hero image management page
   - POST route for upload handling

3. ✅ **Create admin view template**
   - Upload form
   - Current image preview
   - Success/error handling

4. ✅ **Update homepage templates**
   - Use dynamic hero image path
   - Add fallback handling

5. ✅ **Update route handlers**
   - Pass hero image path to templates

6. ✅ **Update OG tags middleware**
   - Use dynamic OG image path

7. ✅ **Update admin dashboard**
   - Add hero image management link

8. ✅ **Test**
   - Upload new hero image
   - Verify processing (size, dimensions)
   - Verify homepage display
   - Verify OG tags work

---

## Edge Cases & Considerations

### Edge Cases
1. **No hero image exists**: Show placeholder or hide hero section
2. **Upload fails**: Show error message, keep old image
3. **Invalid file type**: Reject with clear error
4. **File too large**: Multer will reject (50MB limit), but should warn user
5. **Processing fails**: Rollback, show error, keep old image

### Considerations
- **Backup**: Consider backing up old hero image before replacing
- **File permissions**: Ensure write access to `images/` directory
- **FFG Only**: Only implementing for Fruition Forest Garden
- **Performance**: Processing happens during upload (synchronous), may take a few seconds for large images

---

## Future Enhancements (Post-MVP)

1. **Image History**: Keep previous hero images (with timestamps)
2. **Multiple Hero Images**: Rotate between multiple hero images
3. **Scheduled Updates**: Schedule hero image changes
4. **Image Cropping Tool**: Client-side cropping before upload
5. **Preview Before Save**: Show preview of processed image before saving

---

## Questions to Resolve

1. **File Format**: Save as PNG or JPEG? (Recommendation: JPEG for better compression)
2. **Backup Strategy**: Keep old hero images or delete immediately? (Recommendation: Delete immediately, but could add backup option)
3. **Site-Specific**: Different hero image dimensions per site? (Recommendation: Same processing, different filenames)
4. **OG Image Aspect Ratio**: Crop to 1200x630 or maintain aspect ratio? (Recommendation: Crop to fit Facebook's recommended ratio)

---

## Estimated Implementation Time

- **Backend (Processor + Routes)**: 2-3 hours
- **Frontend (Admin UI)**: 1-2 hours
- **Template Updates**: 1 hour
- **Testing & Refinement**: 1-2 hours
- **Total**: ~5-8 hours

---

## Approval Needed

Please review and confirm:
1. ✅ File format preference: **WebP** (confirmed)
2. ✅ Hero image max dimensions: **1920px width** (confirmed)
3. ✅ OG image dimensions: **1200x630px with crop** (confirmed)
4. ✅ Backup strategy: **Delete old immediately** (confirmed)
5. ✅ Only FFG needs this feature (not TTA)

Once approved, I'll proceed with implementation!

