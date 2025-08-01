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
     * String representation of the rectangle
     * @returns {string} String representation
     */
    toString() {
        return `Rectangle(${this.left}, ${this.top}, ${this.right}, ${this.bottom})`;
    }
}