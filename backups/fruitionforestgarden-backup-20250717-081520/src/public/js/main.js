// Add current year to footer
document.addEventListener('DOMContentLoaded', function() {
    const yearElement = document.querySelector('footer p:last-child');
    if (yearElement) {
        yearElement.textContent = `© ${new Date().getFullYear()} Fruition Forest Garden. All rights reserved.`;
    }

    // Lightbox functionality
    const lightboxOverlay = document.getElementById('lightbox-overlay');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxClose = document.getElementById('lightbox-close');

    // Add click event to all images with lightbox-trigger class
    document.querySelectorAll('.lightbox-trigger').forEach(img => {
        img.addEventListener('click', function() {
            if (lightboxImg && lightboxOverlay) {
                lightboxImg.src = this.src;
                lightboxCaption.textContent = this.dataset.caption || '';
                lightboxOverlay.style.display = 'flex';
                document.body.style.overflow = 'hidden'; // Prevent scrolling when lightbox is open
            }
        });
    });

    // Close lightbox when clicking the close button
    if (lightboxClose && lightboxOverlay) {
        lightboxClose.addEventListener('click', function() {
            lightboxOverlay.style.display = 'none';
            document.body.style.overflow = ''; // Restore scrolling
        });
    }

    // Close lightbox when clicking outside the image
    if (lightboxOverlay) {
        lightboxOverlay.addEventListener('click', function(e) {
            if (e.target === this) {
                lightboxOverlay.style.display = 'none';
                document.body.style.overflow = ''; // Restore scrolling
            }
        });
    }

    // Close lightbox with escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && lightboxOverlay && lightboxOverlay.style.display === 'flex') {
            lightboxOverlay.style.display = 'none';
            document.body.style.overflow = ''; // Restore scrolling
        }
    });

    // Mobile menu functionality
    const hamburger = document.querySelector('.hamburger');
    const header = document.querySelector('header');
    const menuOverlay = document.querySelector('.menu-overlay');

    if (hamburger && header && menuOverlay) {
        hamburger.addEventListener('click', function() {
            header.classList.toggle('nav-open');
            menuOverlay.classList.toggle('hidden');
        });
    }

    if (menuOverlay && header) {
        menuOverlay.addEventListener('click', function() {
            header.classList.remove('nav-open');
            menuOverlay.classList.add('hidden');
        });
    }
});

// Add smooth scrolling to all links
const anchors = document.querySelectorAll('a[href^="#"]');
if (anchors.length > 0) {
    anchors.forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
            behavior: 'smooth'
                });
            }
        });
    });
} 