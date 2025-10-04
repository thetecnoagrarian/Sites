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
    
    // Mobile dropdown functionality
    const dropdownToggles = document.querySelectorAll('.dropdown-toggle, .categories-toggle');
    dropdownToggles.forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            const dropdown = this.closest('.dropdown, .mega-dropdown, .categories-dropdown');
            const dropdownMenu = dropdown.querySelector('.dropdown-menu, .mega-menu, .categories-menu');
            
            // Close other dropdowns
            document.querySelectorAll('.dropdown-menu, .mega-menu, .categories-menu').forEach(menu => {
                if (menu !== dropdownMenu) {
                    menu.classList.remove('active');
                }
            });
            
            // Toggle current dropdown
            dropdownMenu.classList.toggle('active');
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