import Database from 'better-sqlite3';

async function seedDatabase() {
    console.log('Starting database seed...');
    
    // Initialize database connection
    const dbPath = 'src/database/blog.db';
    const db = new Database(dbPath);
    
    try {
        // Import the models from blog-core which should already have db initialized
        const { Post, Category, User } = await import('@ffg/blog-core');
        
        // Test if User model already has admin user
        const existingAdmin = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('admin');
        console.log('Existing admin users:', existingAdmin.count);
        
        // Create test categories (ignore if they exist already)
        console.log('\nCreating test categories...');
        const categories = [];
        const categoryNames = ['Gardening', 'Sustainability', 'Food Forest'];
        
        for (const name of categoryNames) {
            try {
                const category = Category.create(name);
                categories.push(category);
                console.log(`Category "${name}" created with ID:`, category.lastInsertRowid);
            } catch (error) {
                console.log(`Category "${name}" might already exist, skipping...`);
                // Get existing category
                const existing = db.prepare('SELECT * FROM categories WHERE name = ?').get(name);
                if (existing) categories.push(existing);
            }
        }
        
        // Create test posts (ignore if they exist already)
        console.log('\nCreating test posts...');
        const posts = [
            {
                title: 'Welcome to The Tecnoagrarian',
                body: 'Welcome to our tech-focused gardening blog! Here we explore the intersection of technology and agriculture, covering topics from automated irrigation systems to smart farming practices.',
                description: 'Introduction to our techno-agricultural blog',
                excerpt: 'Welcome to our new blog exploring technology and sustainable agriculture!',
                images: ['/images/Hero.png'],
                captions: ['Technology meets agriculture']
            },
            {
                title: 'Smart Irrigation Systems',
                body: 'Modern irrigation systems use sensors, IoT devices, and AI to optimize water usage in agriculture. Learn about automated irrigation controllers and soil moisture monitoring.',
                description: 'Guide to smart irrigation technology',
                excerpt: 'Discover how technology can optimize your irrigation.',
                images: ['/images/TTA.PNG'],
                captions: ['Smart irrigation technology']
            },
            {
                title: 'Sustainable Farming with Technology',
                body: 'Combining traditional farming wisdom with modern technology creates powerful sustainable agriculture practices. From permaculture apps to drone monitoring.',
                description: 'Technology solutions for sustainable farming',
                excerpt: 'Harness technology for sustainable agriculture.',
                images: ['/images/TTA.PNG'],
                captions: ['Technology and sustainability']
            }
        ];
        
        for (const postData of posts) {
            try {
                const post = Post.create(postData);
                console.log(`Post "${postData.title}" created with ID:`, post.lastInsertRowid);
                
                // Add all categories to each post
                for (const category of categories) {
                    try {
                        Post.addCategory(post.lastInsertRowid, category.lastInsertRowid || category.id);
                    } catch (error) {
                        console.log(`Skipping category assignment for post ${post.lastInsertRowid}, category ${category.lastInsertRowid || category.id}`);
                    }
                }
            } catch (error) {
                console.log(`Post "${postData.title}" might already exist, skipping...`);
            }
        }
        
        console.log('\nSeeding completed successfully!');
        
        // Show current stats
        const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').get().count;
        const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        
        console.log(`\nDatabase stats:`);
        console.log(`- Users: ${userCount}`);
        console.log(`- Categories: ${categoryCount}`);
        console.log(`- Posts: ${postCount}`);
        
    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        db.close();
    }
}

seedDatabase().catch(console.error);
