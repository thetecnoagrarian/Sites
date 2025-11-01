document.addEventListener('DOMContentLoaded', function() {
    // Handle existing images in edit mode
    const existingImageContainer = document.getElementById('existing-images');
    if (existingImageContainer) {
        const removeButtons = existingImageContainer.querySelectorAll('.remove-image');
        removeButtons.forEach(button => {
            button.addEventListener('click', function() {
                const imageWrapper = button.closest('.image-preview-item');
                const imagePath = imageWrapper.dataset.path;
                
                // Add to remove list
                const removeInput = document.createElement('input');
                removeInput.type = 'hidden';
                removeInput.name = 'removeImages[]';
                removeInput.value = imagePath;
                document.querySelector('form').appendChild(removeInput);
                
                // Hide the image wrapper
                imageWrapper.style.display = 'none';
            });
        });
    }
    
    // Admin mobile menu functionality
    const adminHamburger = document.querySelector('.admin-hamburger');
    const adminHeader = document.querySelector('.admin-header');
    const adminMenuOverlay = document.querySelector('.admin-menu-overlay');
    
    if (adminHamburger && adminHeader && adminMenuOverlay) {
        adminHamburger.addEventListener('click', function() {
            adminHeader.classList.toggle('nav-open');
            adminMenuOverlay.classList.toggle('hidden');
        });
        
        adminMenuOverlay.addEventListener('click', function() {
            adminHeader.classList.remove('nav-open');
            adminMenuOverlay.classList.add('hidden');
        });
    }
}); 