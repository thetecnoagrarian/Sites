const User = require('./src/models/user');
const Post = require('./src/models/post');
const Category = require('./src/models/category');

// --- Print all posts and exit (for debugging) ---
if (process.argv.includes('--print-posts')) {
    const posts = Post.findAll(100, 0); // Get up to 100 posts
    console.log('All posts in database:');
    console.log(posts);
    process.exit(0);
}

async function runTests() {
    console.log('Starting database tests...\n');

    try {
        // Test User Model
        console.log('Testing User Model:');
        console.log('------------------');
        
        // Create test user
        console.log('Creating test user...');
        const user = User.create('testuser', 'password123');
        console.log('User created with ID:', user.lastInsertRowid);
        
        // Find user by username
        const foundUser = User.findByUsername('testuser');
        console.log('Found user by username:', foundUser ? 'Success' : 'Failed');
        
        // Verify password
        const isValid = User.verifyPassword('password123', foundUser.password);
        console.log('Password verification:', isValid ? 'Success' : 'Failed');
        
        // Test Category Model
        console.log('\nTesting Category Model:');
        console.log('---------------------');
        
        // Create test categories
        console.log('Creating test categories...');
        const category1 = Category.create('Gardening');
        const category2 = Category.create('Sustainability');
        console.log('Categories created with IDs:', category1.lastInsertRowid, category2.lastInsertRowid);
        
        // Find all categories
        const categories = Category.findAll();
        console.log('Found categories:', categories.length);
        
        // Test Post Model
        console.log('\nTesting Post Model:');
        console.log('-----------------');
        
        // Create test post
        console.log('Creating test post...');
        const post = Post.create({
            title: 'Test Post',
            body: 'This is a test post body',
            description: 'Test post description',
            excerpt: 'Test post excerpt',
            images: ['/images/test1.jpg', '/images/test2.jpg'],
            captions: ['Test image 1', 'Test image 2']
        });
        console.log('Post created with ID:', post.lastInsertRowid);
        
        // Add categories to post
        console.log('Adding categories to post...');
        Post.addCategory(post.lastInsertRowid, category1.lastInsertRowid);
        Post.addCategory(post.lastInsertRowid, category2.lastInsertRowid);
        
        // Find post by ID
        const foundPost = Post.findById(post.lastInsertRowid);
        console.log('Found post by ID:', foundPost ? 'Success' : 'Failed');
        console.log('Post images:', foundPost.images);
        console.log('Post captions:', foundPost.captions);
        
        // Get post categories
        const postCategories = Post.getCategories(post.lastInsertRowid);
        console.log('Post categories:', postCategories.length);
        
        // Find all posts
        const posts = Post.findAll();
        console.log('Found posts:', posts.length);
        
        // Test Category Posts
        console.log('\nTesting Category Posts:');
        console.log('---------------------');
        
        const categoryPosts = Category.getPosts(category1.lastInsertRowid);
        console.log('Posts in Gardening category:', categoryPosts.length);
        
        // Cleanup
        console.log('\nCleaning up test data...');
        Post.delete(post.lastInsertRowid);
        Category.delete(category1.lastInsertRowid);
        Category.delete(category2.lastInsertRowid);
        User.delete(foundUser.id);
        
        console.log('\nAll tests completed successfully!');
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

runTests(); 