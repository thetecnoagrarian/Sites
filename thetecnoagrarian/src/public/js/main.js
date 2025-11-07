// Add current year to footer
document.addEventListener('DOMContentLoaded', function() {
    const yearElement = document.querySelector('footer p:last-child');
    if (yearElement) {
        yearElement.textContent = `© ${new Date().getFullYear()} The Tecnoagrarian. All rights reserved.`;
    }

    // Lightbox functionality
    const lightboxOverlay = document.getElementById('lightbox-overlay');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxClose = document.getElementById('lightbox-close');

    // Add click event to all images with lightbox-trigger class
    document.querySelectorAll('.lightbox-trigger').forEach(img => {
        img.addEventListener('click', function() {
            lightboxImg.src = this.src;
            lightboxCaption.textContent = this.dataset.caption || '';
            lightboxOverlay.style.display = 'flex';
            document.body.style.overflow = 'hidden'; // Prevent scrolling when lightbox is open
        });
    });

    // Close lightbox when clicking the close button
    lightboxClose.addEventListener('click', function() {
        lightboxOverlay.style.display = 'none';
        document.body.style.overflow = ''; // Restore scrolling
    });

    // Close lightbox when clicking outside the image
    lightboxOverlay.addEventListener('click', function(e) {
        if (e.target === this) {
            lightboxOverlay.style.display = 'none';
            document.body.style.overflow = ''; // Restore scrolling
        }
    });

    // Close lightbox with escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && lightboxOverlay.style.display === 'flex') {
            lightboxOverlay.style.display = 'none';
            document.body.style.overflow = ''; // Restore scrolling
        }
    });

    // Mobile menu functionality
    const hamburger = document.querySelector('.hamburger');
    const header = document.querySelector('header');
    const menuOverlay = document.querySelector('.menu-overlay');

    if (hamburger) {
        hamburger.addEventListener('click', function() {
            header.classList.toggle('nav-open');
            menuOverlay.classList.toggle('hidden');
        });
    }

    if (menuOverlay) {
        menuOverlay.addEventListener('click', function() {
            header.classList.remove('nav-open');
            menuOverlay.classList.add('hidden');
        });
    }
    
    // Categories bottom sheet modal functionality (mobile)
    const categoriesToggle = document.querySelector('.categories-toggle');
    const categoriesMenu = document.querySelector('.categories-menu');
    const categoriesBackdrop = document.querySelector('.categories-backdrop');
    const categoriesClose = document.querySelector('.categories-close');
    
    function openCategoriesModal() {
        if (categoriesMenu && categoriesBackdrop) {
            categoriesMenu.classList.add('active');
            categoriesBackdrop.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent scrolling
        }
    }
    
    function closeCategoriesModal() {
        if (categoriesMenu && categoriesBackdrop) {
            categoriesMenu.classList.remove('active');
            categoriesBackdrop.classList.remove('active');
            document.body.style.overflow = ''; // Restore scrolling
        }
    }
    
    // Open modal when categories button is clicked
    if (categoriesToggle) {
        categoriesToggle.addEventListener('click', function(e) {
            // Check if we're on mobile (window width <= 1133px)
            if (window.innerWidth <= 1133) {
                e.preventDefault();
                e.stopPropagation();
                openCategoriesModal();
            }
            // On desktop, let the hover behavior work (no preventDefault)
        });
    }
    
    // Close modal when backdrop is clicked
    if (categoriesBackdrop) {
        categoriesBackdrop.addEventListener('click', function(e) {
            if (e.target === categoriesBackdrop) {
                closeCategoriesModal();
            }
        });
    }
    
    // Close modal when close button is clicked
    if (categoriesClose) {
        categoriesClose.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            closeCategoriesModal();
        });
    }
    
    // Close modal with escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && categoriesMenu && categoriesMenu.classList.contains('active')) {
            closeCategoriesModal();
        }
    });
    
    // Close modal when a category link is clicked (on mobile)
    if (categoriesMenu) {
        const categoryLinks = categoriesMenu.querySelectorAll('.category-link');
        categoryLinks.forEach(link => {
            link.addEventListener('click', function() {
                // Only close on mobile
                if (window.innerWidth <= 1133) {
                    closeCategoriesModal();
                }
            });
        });
    }
    
    // Mobile dropdown functionality (for other dropdowns)
    const dropdownToggles = document.querySelectorAll('.dropdown-toggle');
    dropdownToggles.forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            const dropdown = this.closest('.dropdown, .mega-dropdown');
            const dropdownMenu = dropdown.querySelector('.dropdown-menu, .mega-menu');
            
            // Close other dropdowns
            document.querySelectorAll('.dropdown-menu, .mega-menu').forEach(menu => {
                if (menu !== dropdownMenu) {
                    menu.classList.remove('active');
                }
            });
            
            // Toggle current dropdown
            if (dropdownMenu) {
            dropdownMenu.classList.toggle('active');
            }
        });
    });
});

// Add smooth scrolling to all links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
}); 