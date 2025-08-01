/**
 * EdgeMaxValues - Stores maximum values for each row and column across all channels
 * Channels are stored in RGBA interleaved format (same as ImageData)
 */
export class EdgeMaxValues {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        
        // Each element stores 4 channels (RGBA) as bytes in a 32-bit integer
        // Format: 0xAABBGGRR (little-endian: R, G, B, A)
        this.rowMaxs = new Uint32Array(height);
        this.columnMaxs = new Uint32Array(width);
        
        this.clear();
    }
    
    /**
     * Clear all maximum values to zero
     */
    clear() {
        this.rowMaxs.fill(0);
        this.columnMaxs.fill(0);
    }
    
    /**
     * Consider a sample and update row/column maximums if needed
     * @param {number} x - Column index
     * @param {number} y - Row index
     * @param {number} packedRGBA - 32-bit integer containing RGBA values (0xAABBGGRR)
     */
    considerSample(x, y, packedRGBA) {
        // Extract individual channels from packed integer
        const r = packedRGBA & 0xFF;
        const g = (packedRGBA >> 8) & 0xFF;
        const b = (packedRGBA >> 16) & 0xFF;
        const a = (packedRGBA >> 24) & 0xFF;
        
        // Update row maximum
        const currentRowMax = this.rowMaxs[y];
        const rowR = Math.max(currentRowMax & 0xFF, r);
        const rowG = Math.max((currentRowMax >> 8) & 0xFF, g);
        const rowB = Math.max((currentRowMax >> 16) & 0xFF, b);
        const rowA = Math.max((currentRowMax >> 24) & 0xFF, a);
        this.rowMaxs[y] = (rowA << 24) | (rowB << 16) | (rowG << 8) | rowR;
        
        // Update column maximum
        const currentColMax = this.columnMaxs[x];
        const colR = Math.max(currentColMax & 0xFF, r);
        const colG = Math.max((currentColMax >> 8) & 0xFF, g);
        const colB = Math.max((currentColMax >> 16) & 0xFF, b);
        const colA = Math.max((currentColMax >> 24) & 0xFF, a);
        this.columnMaxs[x] = (colA << 24) | (colB << 16) | (colG << 8) | colR;
    }
    
    /**
     * Get maximum values for a specific row
     * @param {number} y - Row index
     * @returns {number[]} Four-element array [r, g, b, a]
     */
    getRowMax(y) {
        const packed = this.rowMaxs[y];
        return [
            packed & 0xFF,
            (packed >> 8) & 0xFF,
            (packed >> 16) & 0xFF,
            (packed >> 24) & 0xFF
        ];
    }
    
    /**
     * Get maximum values for a specific column
     * @param {number} x - Column index
     * @returns {number[]} Four-element array [r, g, b, a]
     */
    getColumnMax(x) {
        const packed = this.columnMaxs[x];
        return [
            packed & 0xFF,
            (packed >> 8) & 0xFF,
            (packed >> 16) & 0xFF,
            (packed >> 24) & 0xFF
        ];
    }
    
    /**
     * Get the raw Uint32Array for row maximums
     * @returns {Uint32Array} Array of packed RGBA values
     */
    getRowMaxsArray() {
        return this.rowMaxs;
    }
    
    /**
     * Get the raw Uint32Array for column maximums
     * @returns {Uint32Array} Array of packed RGBA values
     */
    getColumnMaxsArray() {
        return this.columnMaxs;
    }
    
    /**
     * Get both row and column maximum arrays
     * @returns {Object} Object with rowMaxs and columnMaxs properties
     */
    getMaxArrays() {
        return {
            rowMaxs: this.rowMaxs,
            columnMaxs: this.columnMaxs
        };
    }
}

/**
 * EdgeFinder - A WebGL-based edge detection class using Chebyshev distances
 * Computes distances between current pixel and neighbors (up, down, left, right)
 * Output channels: Red=up, Green=down, Blue=left, Alpha=right
 */
export class EdgeFinder {
    constructor(width, height, config = {}) {
        this.width = width;
        this.height = height;
        
        // Extract config options with defaults
        const {
            useOffscreen = false,
            diffToEdge = false
        } = config;
        
        this.useOffscreen = useOffscreen;
        this.diffToEdge = diffToEdge;
        
        // Create canvas (regular or offscreen)
        if (this.useOffscreen && typeof OffscreenCanvas !== 'undefined') {
            this.canvas = new OffscreenCanvas(width, height);
        } else {
            this.canvas = document.createElement('canvas');
            this.canvas.width = width;
            this.canvas.height = height;
        }
        
        // Get WebGL context
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        if (!this.gl) {
            throw new Error('WebGL not supported');
        }
        
        // Check for NPOT texture support
        if (!this.checkNPOTSupport()) {
            throw new Error('NPOT (Non-Power-Of-Two) textures not properly supported');
        }
        
        // Initialize edge max values tracker
        this.edgeMaxValues = new EdgeMaxValues(width, height);
        
        this.initWebGL();
    }
    
    checkNPOTSupport() {
        // Test if we can create and use NPOT textures
        const testTexture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, testTexture);
        
        try {
            // Try to create a NPOT texture
            this.gl.texImage2D(
                this.gl.TEXTURE_2D, 0, this.gl.RGBA, 
                this.width, this.height, 0, 
                this.gl.RGBA, this.gl.UNSIGNED_BYTE, null
            );
            
            // Set parameters for NPOT textures
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            
            this.gl.deleteTexture(testTexture);
            return true;
        } catch (e) {
            this.gl.deleteTexture(testTexture);
            return false;
        }
    }
    
    initWebGL() {
        const gl = this.gl;
        
        // Vertex shader - creates a full-screen quad
        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;
        
        // Fragment shader - computes Chebyshev distances
        const fragmentShaderSource = `
            precision mediump float;
            uniform sampler2D u_texture;
            uniform vec2 u_resolution;
            uniform bool u_diffToEdge;
            varying vec2 v_texCoord;
            
            float chebyshevDistance(vec4 a, vec4 b) {
                vec4 diff = abs(a - b);
                return max(max(max(diff.r, diff.g), diff.b), diff.a);
            }
            
            void main() {
                vec2 texelSize = 1.0 / u_resolution;
                vec4 current = texture2D(u_texture, v_texCoord);
                
                vec4 up, down, left, right;
                
                if (u_diffToEdge) {
                    // Compare to edge pixels
                    up = texture2D(u_texture, vec2(v_texCoord.x, texelSize.y * 0.5)); // Top edge
                    down = texture2D(u_texture, vec2(v_texCoord.x, 1.0 - texelSize.y * 0.5)); // Bottom edge
                    left = texture2D(u_texture, vec2(texelSize.x * 0.5, v_texCoord.y)); // Left edge
                    right = texture2D(u_texture, vec2(1.0 - texelSize.x * 0.5, v_texCoord.y)); // Right edge
                } else {
                    // Compare to neighboring pixels
                    down = texture2D(u_texture, v_texCoord + vec2(0.0, texelSize.y));
                    up = texture2D(u_texture, v_texCoord - vec2(0.0, texelSize.y));
                    left = texture2D(u_texture, v_texCoord - vec2(texelSize.x, 0.0));
                    right = texture2D(u_texture, v_texCoord + vec2(texelSize.x, 0.0));
                }
                
                // Compute Chebyshev distances
                float distUp = chebyshevDistance(current, up);
                float distDown = chebyshevDistance(current, down);
                float distLeft = chebyshevDistance(current, left);
                float distRight = chebyshevDistance(current, right);
                
                gl_FragColor = vec4(distUp, distDown, distLeft, distRight);
            }
        `;
        
        // Compile shaders
        this.vertexShader = this.compileShader(vertexShaderSource, gl.VERTEX_SHADER);
        this.fragmentShader = this.compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
        
        // Create program
        this.program = gl.createProgram();
        gl.attachShader(this.program, this.vertexShader);
        gl.attachShader(this.program, this.fragmentShader);
        gl.linkProgram(this.program);
        
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new Error('Program linking failed: ' + gl.getProgramInfoLog(this.program));
        }
        
        // Get attribute and uniform locations
        this.positionAttribute = gl.getAttribLocation(this.program, 'a_position');
        this.texCoordAttribute = gl.getAttribLocation(this.program, 'a_texCoord');
        this.textureUniform = gl.getUniformLocation(this.program, 'u_texture');
        this.resolutionUniform = gl.getUniformLocation(this.program, 'u_resolution');
        this.diffToEdgeUniform = gl.getUniformLocation(this.program, 'u_diffToEdge');
        
        // Create buffers for full-screen quad
        this.setupQuad();
        
        // Create texture
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        // Set viewport
        gl.viewport(0, 0, this.width, this.height);
    }
    
    compileShader(source, type) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error('Shader compilation failed: ' + error);
        }
        
        return shader;
    }
    
    setupQuad() {
        const gl = this.gl;
        
        // Full-screen quad vertices
        const positions = new Float32Array([
            -1, -1,  1, -1,  -1,  1,
            -1,  1,  1, -1,   1,  1
        ]);
        
        // Texture coordinates (flipped Y to correct WebGL upside-down rendering)
        const texCoords = new Float32Array([
            0, 0,  1, 0,  0, 1,
            0, 1,  1, 0,  1, 1
        ]);
        
        // Create and bind position buffer
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        
        // Create and bind texture coordinate buffer
        this.texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    }
    
    /**
     * Process an ImageBitmap and render the edge detection result
     * @param {ImageBitmap} imageBitmap - The input image
     */
    processImage(imageBitmap) {
        const gl = this.gl;
        
        // Clear the edge max values for new processing
        this.edgeMaxValues.clear();
        
        // Upload image to texture
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap);
        
        // Use shader program
        gl.useProgram(this.program);
        
        // Set uniforms
        gl.uniform1i(this.textureUniform, 0);
        gl.uniform2f(this.resolutionUniform, this.width, this.height);
        gl.uniform1i(this.diffToEdgeUniform, this.diffToEdge ? 1 : 0);
        
        // Bind texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        
        // Set up attributes
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(this.positionAttribute);
        gl.vertexAttribPointer(this.positionAttribute, 2, gl.FLOAT, false, 0, 0);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.enableVertexAttribArray(this.texCoordAttribute);
        gl.vertexAttribPointer(this.texCoordAttribute, 2, gl.FLOAT, false, 0, 0);
        
        // Draw
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        // Update edge max values by reading back the processed data
        this.updateEdgeMaxValues();
    }
    
    /**
     * Update the EdgeMaxValues by reading the processed image data
     */
    updateEdgeMaxValues() {
        const gl = this.gl;
        const pixels = new Uint8Array(this.width * this.height * 4);
        gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        
        // Use DataView for endian-safe 32-bit integer reading
        const pixelsView = new DataView(pixels.buffer);
        
        // Process each pixel
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const pixelIndex = y * this.width + x;
                const byteOffset = pixelIndex * 4;
                // Read as little-endian 32-bit integer (RGBA -> 0xAABBGGRR)
                const packedPixel = pixelsView.getUint32(byteOffset, true);
                this.edgeMaxValues.considerSample(x, y, packedPixel);
            }
        }
    }
    
    /**
     * Get the canvas element (for DOM insertion)
     * @returns {HTMLCanvasElement|OffscreenCanvas} The canvas element
     */
    getCanvas() {
        return this.canvas;
    }
    
    /**
     * Get the processed image data as ImageData
     * @returns {ImageData} The processed image data
     */
    getImageData() {
        const gl = this.gl;
        const pixels = new Uint8Array(this.width * this.height * 4);
        gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        
        // No need to flip since we corrected the texture coordinates
        return new ImageData(new Uint8ClampedArray(pixels), this.width, this.height);
    }
    
    /**
     * Get the EdgeMaxValues instance
     * @returns {EdgeMaxValues} The edge max values tracker
     */
    getEdgeMaxValues() {
        return this.edgeMaxValues;
    }
    
    /**
     * Get both row and column maximum arrays
     * @returns {Object} Object with rowMaxs and columnMaxs Uint32Arrays
     */
    getMaxArrays() {
        return this.edgeMaxValues.getMaxArrays();
    }
    
    /**
     * Clean up WebGL resources
     */
    dispose() {
        const gl = this.gl;
        
        if (this.texture) gl.deleteTexture(this.texture);
        if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
        if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
        if (this.program) gl.deleteProgram(this.program);
        if (this.vertexShader) gl.deleteShader(this.vertexShader);
        if (this.fragmentShader) gl.deleteShader(this.fragmentShader);
    }
}
