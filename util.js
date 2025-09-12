/**
 * Rectangle class for representing rectangular regions
 * A point (x,y) is within the rectangle if left <= x < right and top <= y < bottom
 * The rectangle is empty if right <= left or bottom <= top
 */
export class Rectangle {
    constructor(left = 0, top = 0, right = 0, bottom = 0) {
        this.left = left;
        this.top = top;
        this.right = right;
        this.bottom = bottom;
    }
    
    /**
     * Check if the rectangle is empty
     * @returns {boolean} True if the rectangle is empty
     */
    isEmpty() {
        return this.right <= this.left || this.bottom <= this.top;
    }
    
    /**
     * Check if a point is within the rectangle
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {boolean} True if the point is within the rectangle
     */
    contains(x, y) {
        return x >= this.left && x < this.right && y >= this.top && y < this.bottom;
    }
    
    /**
     * Get the width of the rectangle
     * @returns {number} Width (right - left)
     */
    getWidth() {
        return this.right - this.left;
    }
    
    /**
     * Get the height of the rectangle
     * @returns {number} Height (bottom - top)
     */
    getHeight() {
        return this.bottom - this.top;
    }
    
    /**
     * Grow (fatten) or shrink the rectangle by the same amount on all sides
     * Positive values fatten the rectangle, negative values shrink it
     * @param {number} amount - Amount to grow by
     * @returns {Rectangle} This rectangle (for chaining)
     */
    grow(amount) {
        this.left -= amount;
        this.top -= amount;
        this.right += amount;
        this.bottom += amount;
        return this;
    }
    
    /**
     * Grow (fatten) or shrink the rectangle by different amounts on each side
     * Positive values fatten the rectangle, negative values shrink it
     * @param {number} leftAmount - Amount to grow the left side by (subtracted from left)
     * @param {number} topAmount - Amount to grow the top side by (subtracted from top)
     * @param {number} rightAmount - Amount to grow the right side by (added to right)
     * @param {number} bottomAmount - Amount to grow the bottom side by (added to bottom)
     * @returns {Rectangle} This rectangle (for chaining)
     */
    growBy(leftAmount, topAmount, rightAmount, bottomAmount) {
        this.left -= leftAmount;
        this.top -= topAmount;
        this.right += rightAmount;
        this.bottom += bottomAmount;
        return this;
    }
    
    /**
     * Create a copy of this rectangle
     * @returns {Rectangle} A new Rectangle instance with the same bounds
     */
    clone() {
        return new Rectangle(this.left, this.top, this.right, this.bottom);
    }
    
    /**
     * Set the bounds of this rectangle
     * @param {number} left - Left coordinate
     * @param {number} top - Top coordinate
     * @param {number} right - Right coordinate
     * @param {number} bottom - Bottom coordinate
     * @returns {Rectangle} This rectangle (for chaining)
     */
    set(left, top, right, bottom) {
        this.left = left;
        this.top = top;
        this.right = right;
        this.bottom = bottom;
        return this;
    }
    
    /**
     * Calculate the intersection with another rectangle
     * @param {Rectangle} other - the other rectangle
     * @returns {Rectangle} Intersection rectangle (may be empty)
     */
    intersect(other) {
        const left = Math.max(this.left, other.left);
        const top = Math.max(this.top, other.top);
        const right = Math.min(this.right, other.right);
        const bottom = Math.min(this.bottom, other.bottom);
        
        // It may create a rectangle that may seem invalid
        // (left >= right || top >= bottom), but that's
        // just an empty rectangle
        return new Rectangle(left, top, right, bottom);
    }

    /**
     * String representation of the rectangle
     * @returns {string} String representation
     */
    toString() {
        return `Rectangle(${this.left}, ${this.top}, ${this.right}, ${this.bottom})`;
    }
}

/**
 * Crop and expand an image based on a rectangle, with optional padding
 * @param {ImageBitmap|HTMLImageElement|HTMLCanvasElement} source - Source image object
 * @param {Rectangle} cropRect - Rectangle defining the crop area (may extend beyond image bounds)
 * @param {Object} config - Configuration options
 * @param {boolean} config.useOffscreen - Whether to use OffscreenCanvas (default: false)
 * @param {string|null} config.paddingColor - CSS color string for padding pixels, or null to use top-left pixel (default: null)
 * @returns {ImageData} ImageData of the cropped/expanded area
 */
export function cropExpand(source, cropRect, config = {}) {
    const { useOffscreen = false, paddingColor = null } = config;
    
    // Get source dimensions
    const sourceWidth = source.naturalWidth || source.videoWidth || source.width;
    const sourceHeight = source.naturalHeight || source.videoHeight || source.height;
    
    if (!sourceWidth || !sourceHeight) {
        throw new Error('Could not determine source image dimensions');
    }
    
    // Get crop dimensions
    const cropWidth = cropRect.getWidth();
    const cropHeight = cropRect.getHeight();
    
    if (cropWidth <= 0 || cropHeight <= 0) {
        throw new Error('Crop rectangle must have positive width and height');
    }
    
    // Create canvas for the operation
    let canvas;
    if (useOffscreen && typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(cropWidth, cropHeight);
    } else {
        canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Determine padding color
    let fillColor = null;
    if (paddingColor === null) {
        // Need to sample the top-left pixel of the source
        fillColor = getTopLeftPixelColor(source, useOffscreen);
    } else {
        fillColor = paddingColor;
    }
    
    // Fill the entire canvas with the padding color
    if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fillRect(0, 0, cropWidth, cropHeight);
    }
    
    // Calculate the intersection between the crop rectangle and the source image bounds
    const sourceRect = new Rectangle(0, 0, sourceWidth, sourceHeight);
    const intersection = cropRect.intersect(sourceRect);
    
    if (!intersection.isEmpty()) {
        // Calculate source coordinates (what part of the source to draw)
        const srcX = intersection.left;
        const srcY = intersection.top;
        const srcWidth = intersection.getWidth();
        const srcHeight = intersection.getHeight();
        
        // Calculate destination coordinates (where to draw on the canvas)
        const destX = intersection.left - cropRect.left;
        const destY = intersection.top - cropRect.top;
        
        // Clear the area where we'll draw the image to avoid blending with fill color
        // This is important when the source image has transparency
        ctx.clearRect(destX, destY, srcWidth, srcHeight);
        
        // Draw the intersecting portion
        ctx.drawImage(
            source,
            srcX, srcY, srcWidth, srcHeight,
            destX, destY, srcWidth, srcHeight
        );
    }
    
    // Get the ImageData
    return ctx.getImageData(0, 0, cropWidth, cropHeight);
}

/**
 * Get the color of the top-left pixel of an image as a CSS color string
 * @param {ImageBitmap|HTMLImageElement|HTMLCanvasElement} source - Source image
 * @param {boolean} useOffscreen - Whether to use OffscreenCanvas
 * @returns {string} CSS color string (hex format: #RRGGBBAA)
 */
function getTopLeftPixelColor(source, useOffscreen = false) {
    // Create a small 1x1 canvas to sample the pixel
    let canvas;
    if (useOffscreen && typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(1, 1);
    } else {
        canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Draw just the top-left pixel
    ctx.drawImage(source, 0, 0, 1, 1, 0, 0, 1, 1);
    
    // Get the pixel data
    const imageData = ctx.getImageData(0, 0, 1, 1);
    const [r, g, b, a] = imageData.data;
    
    // Convert to CSS hex string with alpha
    const toHex = (value) => value.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
}
