const Post = require('../models/post');
const Category = require('../models/category');
const User = require('../models/user');

// Create test user
console.log('Creating test user...');
const user = User.create('admin', 'admin123');
console.log('Test user created with ID:', user.lastInsertRowid);

// Create test categories
console.log('\nCreating test categories...');
const categories = [
    'Gardening',
    'Sustainability',
    'Food Forest'
].map(name => {
    const category = Category.create(name);
    console.log(`Category "${name}" created with ID:`, category.lastInsertRowid);
    return category;
});

// Create test posts
console.log('\nCreating test posts...');
const posts = [
    {
        title: 'Welcome to Fruition Forest Garden',
        body: 'Welcome to our new blog! Here we will share our journey in creating and maintaining a sustainable food forest. We will cover topics ranging from permaculture principles to seasonal gardening tips.',
        description: 'Introduction to our forest garden blog',
        excerpt: 'Welcome to our new blog about sustainable forest gardening!',
        images: ['/images/HeroCamp.png'],
        captions: ['Aerial view of Fruition Forest Garden']
    },
    {
        title: 'Getting Started with Forest Gardening',
        body: 'Forest gardening is a sustainable food production and agroforestry system based on woodland ecosystems. Learn how to start your own food forest with these basic principles and techniques.',
        description: 'Basic principles of forest gardening',
        excerpt: 'Learn how to start your own sustainable food forest.',
        images: ['/images/FFGnewLogo.PNG'],
        captions: ['Fruition Forest Garden Logo']
    },
    {
        title: 'Sustainable Practices in the Garden',
        body: 'Sustainability is at the heart of forest gardening. In this post, we explore various sustainable practices you can implement in your garden, from composting to water conservation.',
        description: 'Sustainable gardening practices',
        excerpt: 'Explore sustainable practices for your garden.',
        images: ['/images/FFGnewLogo.PNG'],
        captions: ['Fruition Forest Garden Logo']
    }
].map(postData => {
    const post = Post.create(postData);
    console.log(`Post "${postData.title}" created with ID:`, post.lastInsertRowid);

    // Add categories to post
    categories.forEach(category => {
        Post.addCategory(post.lastInsertRowid, category.lastInsertRowid);
    });

    return post;
});

console.log('\nSeeding completed successfully!'); 