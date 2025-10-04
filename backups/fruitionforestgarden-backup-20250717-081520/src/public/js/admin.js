document.addEventListener('DOMContentLoaded', function() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('image-input');
    const previewContainer = document.getElementById('image-preview');
    const maxFiles = 25;

    // Make drop zone clickable
    if (dropZone) {
        dropZone.addEventListener('click', () => {
            fileInput.click();
        });
    }

    if (dropZone && fileInput) {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        // Highlight drop zone when item is dragged over it
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight, false);
        });

        // Handle dropped files
        dropZone.addEventListener('drop', handleDrop, false);
        
        // Handle file input change
        fileInput.addEventListener('change', function(e) {
            handleFiles(e.target.files);
        });
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight(e) {
        dropZone.classList.add('drag-over');
    }

    function unhighlight(e) {
        dropZone.classList.remove('drag-over');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    function handleFiles(files) {
        const currentFiles = previewContainer.querySelectorAll('.image-preview-item').length;
        const remainingSlots = maxFiles - currentFiles;
        
        if (remainingSlots <= 0) {
            alert(`Maximum ${maxFiles} images allowed`);
            return;
        }

        const allowedFiles = Array.from(files).slice(0, remainingSlots);
        allowedFiles.forEach(previewFile);

        // Update the actual file input
        const existingFiles = Array.from(fileInput.files || []);
        const newFileList = new DataTransfer();
        
        // Add existing files
        existingFiles.forEach(file => newFileList.items.add(file));
        
        // Add new files
        allowedFiles.forEach(file => newFileList.items.add(file));
        
        fileInput.files = newFileList.files;
    }

    function previewFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please upload only image files');
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = function() {
            const preview = createPreviewElement(reader.result, file.name);
            previewContainer.appendChild(preview);
        }
    }

    function createPreviewElement(src, filename) {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-preview-item';
        
        const img = document.createElement('img');
        img.src = src;
        img.alt = filename;
        
        const caption = document.createElement('input');
        caption.type = 'text';
        caption.name = `caption_${filename}`;
        caption.placeholder = 'Enter caption';
        caption.className = 'form-control';
        
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-image';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = function() {
            wrapper.remove();
            updateFileInput(filename);
        };
        
        wrapper.appendChild(img);
        wrapper.appendChild(caption);
        wrapper.appendChild(removeBtn);
        
        return wrapper;
    }

    function updateFileInput(removedFilename) {
        const newFileList = new DataTransfer();
        const existingFiles = Array.from(fileInput.files);
        
        existingFiles.forEach(file => {
            if (file.name !== removedFilename) {
                newFileList.items.add(file);
            }
        });
        
        fileInput.files = newFileList.files;
    }

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
}); 