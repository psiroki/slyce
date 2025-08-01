import { Rectangle } from './util.js';

/**
 * Find margins based on edge detection limits
 * Returns a rectangle that contains all pixels with edge values above the limit
 * Outside this rectangle, no edges are harder than the specified limit
 * 
 * @param {EdgeMaxValues} edgeMaxValues - The edge max values from EdgeFinder
 * @param {number} limit - The edge strength limit (0-255)
 * @returns {Rectangle} Rectangle containing all significant edges
 */
export function findMargins(edgeMaxValues, limit) {
    const width = edgeMaxValues.width;
    const height = edgeMaxValues.height;
    const columnMaxs = edgeMaxValues.getColumnMaxsArray();
    const rowMaxs = edgeMaxValues.getRowMaxsArray();
    
    // Find left margin - leftmost column where blue channel (index 2, left edges) > limit
    let left = width; // Start beyond the image
    for (let x = 0; x < width; x++) {
        const packed = columnMaxs[x];
        const blueValue = (packed >> 16) & 0xFF; // Blue channel (left edges)
        if (blueValue > limit) {
            left = x;
            break;
        }
    }
    
    // Find right margin - rightmost column where alpha channel (index 3, right edges) > limit
    let right = -1; // Start before the image
    for (let x = width - 1; x >= 0; x--) {
        const packed = columnMaxs[x];
        const alphaValue = (packed >> 24) & 0xFF; // Alpha channel (right edges)
        if (alphaValue > limit) {
            right = x + 1; // Include the pixel we found
            break;
        }
    }
    
    // Find top margin - topmost row where red channel (index 0, up edges) > limit
    let top = height; // Start beyond the image
    for (let y = 0; y < height; y++) {
        const packed = rowMaxs[y];
        const redValue = packed & 0xFF; // Red channel (up edges)
        if (redValue > limit) {
            top = y;
            break;
        }
    }
    
    // Find bottom margin - bottommost row where green channel (index 1, down edges) > limit
    let bottom = -1; // Start before the image
    for (let y = height - 1; y >= 0; y--) {
        const packed = rowMaxs[y];
        const greenValue = (packed >> 8) & 0xFF; // Green channel (down edges)
        if (greenValue > limit) {
            bottom = y + 1; // Include the pixel we found
            break;
        }
    }
    
    // Handle case where no edges above limit are found
    if (left >= width || right <= -1) {
        // No significant left or right edges found
        left = 0;
        right = 0;
    }
    
    if (top >= height || bottom <= -1) {
        // No significant top or bottom edges found
        top = 0;
        bottom = 0;
    }
    
    // Ensure valid rectangle (empty if no edges found)
    if (left >= width) left = width;
    if (right <= -1) right = 0;
    if (top >= height) top = height;
    if (bottom <= -1) bottom = 0;
    
    return new Rectangle(left, top, right, bottom);
}