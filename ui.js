import { EdgeFinder } from './EdgeFinder.js';
import { findMargins } from './algorithm.js';
import { Rectangle } from './util.js';

class SlyceApp {
    constructor() {
        this.edgeFinder = null;
        this.sourceImage = document.getElementById('sourceImage');
        this.limitSlider = document.getElementById('limitSlider');
        this.limitValue = document.getElementById('limitValue');
        this.marginOverlay = document.getElementById('marginOverlay');
        this.imageContainer = document.getElementById('imageContainer');
        this.status = document.getElementById('status');
        this.loadImageBtn = document.getElementById('loadImageBtn');
        this.fileInput = document.getElementById('fileInput');
        this.dropOverlay = document.getElementById('dropOverlay');
        
        this.dragCounter = 0; // Track drag enter/leave for nested elements
        
        this.initializeEventListeners();
        this.loadAndProcessImage();
    }

    initializeEventListeners() {
        this.limitSlider.addEventListener('input', () => {
            this.limitValue.textContent = this.limitSlider.value;
            this.updateMargins();
        });

        this.sourceImage.addEventListener('load', () => {
            if (this.edgeFinder) {
                this.processImageWithEdgeFinder();
            }
        });

        this.sourceImage.addEventListener('error', () => {
            this.updateStatus('Error: Could not load image', 'error');
        });

        // File input handling
        this.loadImageBtn.addEventListener('click', () => {
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                this.loadImageFromFile(file);
            }
        });

        // Drag and drop handling
        document.addEventListener('dragenter', (e) => {
            e.preventDefault();
            this.dragCounter++;
            if (this.hasImageFile(e.dataTransfer)) {
                this.dropOverlay.classList.add('show');
            }
        });

        document.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.dragCounter--;
            if (this.dragCounter === 0) {
                this.dropOverlay.classList.remove('show');
            }
        });

        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dragCounter = 0;
            this.dropOverlay.classList.remove('show');
            
            const files = Array.from(e.dataTransfer.files);
            const imageFile = files.find(file => file.type.startsWith('image/'));
            
            if (imageFile) {
                this.loadImageFromFile(imageFile);
            }
        });

        // Paste handling
        document.addEventListener('paste', (e) => {
            const items = Array.from(e.clipboardData.items);
            const imageItem = items.find(item => item.type.startsWith('image/'));
            
            if (imageItem) {
                e.preventDefault();
                const file = imageItem.getAsFile();
                this.loadImageFromFile(file);
            }
        });

        // Focus handling for paste (make sure document can receive paste events)
        document.addEventListener('click', () => {
            document.body.focus();
        });

        // Make body focusable for paste events
        document.body.setAttribute('tabindex', '-1');
    }

    hasImageFile(dataTransfer) {
        if (!dataTransfer || !dataTransfer.types) return false;
        return Array.from(dataTransfer.types).some(type => 
            type === 'Files' && dataTransfer.files && 
            Array.from(dataTransfer.files).some(file => file.type.startsWith('image/'))
        );
    }

    async loadImageFromFile(file) {
        try {
            this.updateStatus('Loading new image...', 'loading');
            
            const url = URL.createObjectURL(file);
            this.sourceImage.src = url;
            
            // Clean up the object URL after the image loads
            this.sourceImage.onload = () => {
                URL.revokeObjectURL(url);
                if (this.edgeFinder) {
                    this.processImageWithEdgeFinder();
                }
            };
            
        } catch (error) {
            this.updateStatus(`Error loading image: ${error.message}`, 'error');
            console.error('Error in loadImageFromFile:', error);
        }
    }

    async loadAndProcessImage() {
        try {
            this.updateStatus('Loading image...', 'loading');
            
            // Wait for image to load if it hasn't already
            if (!this.sourceImage.complete) {
                await new Promise((resolve, reject) => {
                    this.sourceImage.onload = resolve;
                    this.sourceImage.onerror = reject;
                });
            }

            await this.processImageWithEdgeFinder();
        } catch (error) {
            this.updateStatus(`Error: ${error.message}`, 'error');
            console.error('Error in loadAndProcessImage:', error);
        }
    }

    async processImageWithEdgeFinder() {
        try {
            this.updateStatus('Processing edges...', 'loading');

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Set canvas size to match image
            canvas.width = this.sourceImage.naturalWidth;
            canvas.height = this.sourceImage.naturalHeight;
            
            // Draw image to canvas
            ctx.drawImage(this.sourceImage, 0, 0);
            
            // Create ImageBitmap from canvas
            const imageBitmap = await createImageBitmap(canvas);
            
            // Create EdgeFinder
            if (this.edgeFinder) {
                this.edgeFinder.dispose();
            }
            
            this.edgeFinder = new EdgeFinder(canvas.width, canvas.height, { useOffscreen: false });
            
            // Process the image
            this.edgeFinder.processImage(imageBitmap);
            
            // Clean up
            imageBitmap.close();
            
            this.updateStatus('Ready - adjust slider to see margins', '');
            this.updateMargins();
            
        } catch (error) {
            this.updateStatus(`Processing error: ${error.message}`, 'error');
            console.error('Error in processImageWithEdgeFinder:', error);
        }
    }

    updateMargins() {
        if (!this.edgeFinder) return;

        try {
            const limit = parseInt(this.limitSlider.value);
            const edgeMaxValues = this.edgeFinder.getEdgeMaxValues();
            const margins = findMargins(edgeMaxValues, limit);

            this.updateMarginOverlay(margins);
            this.updateMarginInfo(margins);
        } catch (error) {
            console.error('Error updating margins:', error);
            this.updateStatus(`Margin calculation error: ${error.message}`, 'error');
        }
    }

    updateMarginOverlay(margins) {
        if (margins.isEmpty()) {
            this.marginOverlay.style.display = 'none';
            return;
        }

        // Get the displayed image dimensions and position
        const imageRect = this.sourceImage.getBoundingClientRect();
        const containerRect = this.imageContainer.getBoundingClientRect();
        
        // Calculate scale factors
        const scaleX = this.sourceImage.offsetWidth / this.sourceImage.naturalWidth;
        const scaleY = this.sourceImage.offsetHeight / this.sourceImage.naturalHeight;
        
        // Calculate overlay position and size
        const left = margins.left * scaleX;
        const top = margins.top * scaleY;
        const width = margins.getWidth() * scaleX;
        const height = margins.getHeight() * scaleY;
        
        // Position overlay relative to image container
        const imageOffsetX = this.sourceImage.offsetLeft;
        const imageOffsetY = this.sourceImage.offsetTop;
        
        this.marginOverlay.style.display = 'block';
        this.marginOverlay.style.left = (imageOffsetX + left) + 'px';
        this.marginOverlay.style.top = (imageOffsetY + top) + 'px';
        this.marginOverlay.style.width = width + 'px';
        this.marginOverlay.style.height = height + 'px';
    }

    updateMarginInfo(margins) {
        document.getElementById('leftMargin').textContent = margins.left;
        document.getElementById('topMargin').textContent = margins.top;
        document.getElementById('rightMargin').textContent = margins.right;
        document.getElementById('bottomMargin').textContent = margins.bottom;
        document.getElementById('marginWidth').textContent = margins.getWidth();
        document.getElementById('marginHeight').textContent = margins.getHeight();
    }

    updateStatus(message, className = '') {
        this.status.textContent = message;
        this.status.className = `status ${className}`;
    }
}

function main() {
    // Initialize the app when the page loads
    if (document.readyState === 'loading') {
        // DOMContentLoaded has NOT fired yet
        document.addEventListener('DOMContentLoaded', () => {
            new SlyceApp();
        });
    } else {
        // DOMContentLoaded has ALREADY fired
        new SlyceApp();
    }
}

main();
