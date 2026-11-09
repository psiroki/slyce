/**
 * ImpulseSpinner - Interactive Drag & Flick Spinner for HTML Number Inputs
 * =========================================================================
 *
 * An interactive, momentum-driven UX wrapper for `<input type="number">`.
 * Features horizontal drag-to-adjust, velocity flick physics with friction decay,
 * non-linear drag acceleration, hard boundary value locking, decoupled visual
 * rubber-band stretching, and bi-directional keyboard typing synchronization.
 *
 * @example
 * // 1. Basic Usage:
 * import { ImpulseSpinner } from './impulse-spinner.js';
 * const inputEl = document.querySelector('.stoatLengthInput');
 * const stoatLength = new ImpulseSpinner(inputEl);
 *
 * // Access discrete value identically to input element:
 * console.log(stoatLength.value); // returns integer e.g., 25
 * stoatLength.value = 50;         // updates input & resets visual state
 *
 * // 2. Custom Options (including Acceleration tuning):
 * const spinner = new ImpulseSpinner(inputEl, {
 *   sensitivity: 0.10,   // Base precision (low = fine control for slow drags)
 *   acceleration: 0.05,  // Acceleration multiplier for fast gestures
 *   friction: 0.95,      // Flick momentum decay rate (0 to 1)
 *   springStiffness: 0.3 // Rubber band visual return spring force
 * });
 *
 * REQUIRED CSS STYLES:
 * --------------------
 * Add the following CSS class to your input element or target stylesheet.
 *
 * .impulse-input {
 *   touch-action: none;
 *   user-select: none;
 *   -webkit-user-select: none;
 *   cursor: ew-resize;
 *   outline: none;
 *   will-change: transform;
 *
 *   --progress: 0%;
 *   background: linear-gradient(
 *     to right,
 *     #3b82f6 var(--progress),
 *     #1e293b var(--progress)
 *   );
 * }
 *
 *
 * .impulse-input::-webkit-outer-spin-button,
 * .impulse-input::-webkit-inner-spin-button {
 *   -webkit-appearance: none;
 *   margin: 0;
 * }
 * .impulse-input[type=number] {
 *   -moz-appearance: textfield;
 * }
 * 
 * CSS notes:
 * - The touch-action property is critical for Touch: prevents page scroll & swipe gestures while dragging.
 * - The --progress variable sets the visual progress fill
 * - It also hides the native browser spinners
 */

export class ImpulseSpinner {
  /**
   * @param {HTMLInputElement} inputElement - The target HTMLInputElement to enhance.
   * @param {Object} [options={}] - Configuration options.
   * @param {number} [options.sensitivity=0.10] - Pixels-to-value base drag sensitivity ratio.
   * @param {number} [options.acceleration=0.05] - Velocity acceleration factor for large/fast drags.
   * @param {number} [options.friction=0.95] - Momentum decay rate per frame (0 to 1).
   * @param {number} [options.springStiffness=0.25] - Rubber band visual return spring force.
   * @param {number} [options.springDamping=0.70] - Rubber band spring damping coefficient.
   * @param {number} [options.stopThreshold=0.01] - Minimum velocity to terminate animation loop.
   * @param {(value: number) => void} [options.onValueChange] - Called whenever the discrete (rounded)
   *   value changes, whether by dragging, momentum, or typing. Programmatic input.value updates do not
   *   fire native `input` events, so use this to react to changes.
   */
  constructor(inputElement, options = {}) {
    if (!inputElement || !(inputElement instanceof HTMLInputElement)) {
      throw new Error('[ImpulseSpinner] A valid HTMLInputElement must be provided.');
    }

    this.input = inputElement;

    // Physics parameters
    this.sensitivity = options.sensitivity ?? 0.10;
    this.acceleration = options.acceleration ?? 0.05;
    this.friction = options.friction ?? 0.95;
    this.springStiffness = options.springStiffness ?? 0.25;
    this.springDamping = options.springDamping ?? 0.70;
    this.stopThreshold = options.stopThreshold ?? 0.01;
    this.onValueChange = options.onValueChange ?? null;

    // Core numeric state
    this.internalValue = parseFloat(this.input.value) || 0;
    this.velocity = 0;
    this.isDragging = false;
    this.lastX = 0;
    this.lastTime = 0;
    this.animationFrame = null;
    this.pointerType = 'mouse';

    // Decoupled visual elasticity state
    this.visualOffset = 0;
    this.offsetVelocity = 0;

    // Read min/max bounds from HTML element attribute or fallback to Infinity
    this.min = this.input.min !== "" && !isNaN(parseFloat(this.input.min)) 
      ? parseFloat(this.input.min) 
      : -Infinity;
    this.max = this.input.max !== "" && !isNaN(parseFloat(this.input.max)) 
      ? parseFloat(this.input.max) 
      : Infinity;

    // Bound methods for clean lifecycle listener removal
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onInput = this.onInput.bind(this);
    this._onChange = this.onChange.bind(this);

    this.clampValue();
    this._lastEmittedValue = this.value;
    this.initEvents();
    this.updateUI();
  }

  /**
   * Getter for discrete rounded integer value hard-clamped to min/max.
   * Mimics HTMLInputElement.prototype.value behavior.
   * @returns {number} Discrete clamped value.
   */
  get value() {
    return Math.round(this.internalValue);
  }

  /**
   * Setter for programmatically changing value.
   * Resets momentum and clears visual displacement.
   * @param {number|string} val - Value to set.
   */
  set value(val) {
    this.stopAnimation();
    this.internalValue = parseFloat(val) || 0;
    this.clampValue();
    this.velocity = 0;
    this.visualOffset = 0;
    this.offsetVelocity = 0;
    this.updateUI();
  }

  /**
   * Dynamically update boundary limits.
   * @param {number} min - Minimum value.
   * @param {number} max - Maximum value.
   */
  updateBounds(min, max) {
    this.min = typeof min === 'number' ? min : -Infinity;
    this.max = typeof max === 'number' ? max : Infinity;
    this.clampValue();
    this.updateUI();
  }

  /**
   * Hard clamps internal floating-point value to strictly reside within bounds.
   * @private
   */
  clampValue() {
    this.internalValue = Math.max(this.min, Math.min(this.max, this.internalValue));
  }

  /**
   * Attach listener events.
   * @private
   */
  initEvents() {
    this.input.addEventListener('pointerdown', this._onPointerDown);
    this.input.addEventListener('input', this._onInput);
    this.input.addEventListener('change', this._onChange);
    this.input.ondragstart = () => false;
  }

  /**
   * Handles native keystroke input events (virtual & physical keyboard editing).
   * Updates internal state and background progress in real time without disrupting active typing.
   * @private
   */
  onInput() {
    if (this.isDragging) return;

    const parsed = parseFloat(this.input.value);
    if (!isNaN(parsed)) {
      this.internalValue = parsed;
      this.clampValue();
      this.updateUI();
    }
  }

  /**
   * Handles blur / enter change events on the input element.
   * Ensures hard-clamped value formatting is displayed in the input field.
   * @private
   */
  onChange() {
    if (this.isDragging) return;

    const parsed = parseFloat(this.input.value);
    this.internalValue = isNaN(parsed) ? (this.min !== -Infinity ? this.min : 0) : parsed;
    this.clampValue();
    this.updateUI();
  }

  /**
   * Handles pointerdown event (Mouse / Touch).
   * @private
   */
  onPointerDown(e) {
    this.stopAnimation();

    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastTime = performance.now();
    this.velocity = 0;
    this.pointerType = e.pointerType;

    try {
      this.input.setPointerCapture(e.pointerId);
    } catch (err) {
      // Fallback for environment incompatibility
    }

    // Adaptive physics adjustment based on touch vs mouse
    if (e.pointerType === 'touch') {
      this._activeSensitivity = this.sensitivity * 0.8;
      this._activeAcceleration = this.acceleration * 1.2;
      this._activeFriction = Math.min(0.92, this.friction);
    } else {
      this._activeSensitivity = this.sensitivity;
      this._activeAcceleration = this.acceleration;
      this._activeFriction = this.friction;
    }

    this.input.addEventListener('pointermove', this._onPointerMove);
    this.input.addEventListener('pointerup', this._onPointerUp);
    this.input.addEventListener('pointercancel', this._onPointerUp);

    this.updateUI();
  }

  /**
   * Handles pointermove event during active drag.
   * Calculates non-linear mouse/finger drag acceleration based on swipe speed.
   * @private
   */
  onPointerMove(e) {
    if (!this.isDragging) return;

    const currentX = e.clientX;
    const currentTime = performance.now();
    const deltaX = currentX - this.lastX;
    const dt = Math.max(1, currentTime - this.lastTime); // ms elapsed since last move

    // Speed in pixels per millisecond
    const speed = Math.abs(deltaX) / dt;

    // Non-linear acceleration multiplier: 
    // Slow drags (~0.1 px/ms) stay near 1.0 (precise). Fast drags (1.5+ px/ms) scale up value delta.
    const accelMultiplier = 1 + (speed * this._activeAcceleration * 10);
    const deltaValue = deltaX * this._activeSensitivity * accelMultiplier;

    this.lastX = currentX;
    this.lastTime = currentTime;

    // Decoupled boundary & rubber band logic
    if (this.visualOffset !== 0) {
      // If pulled past bound, first collapse the visual stretch
      this.visualOffset += deltaValue * 0.4;

      if (
        (this.internalValue >= this.max && this.visualOffset < 0) ||
        (this.internalValue <= this.min && this.visualOffset > 0)
      ) {
        const remainder = this.visualOffset;
        this.visualOffset = 0;
        this.internalValue += remainder;
        this.clampValue();
      }
    } else {
      // Standard value movement inside valid range
      const nextValue = this.internalValue + deltaValue;

      if (nextValue > this.max) {
        this.internalValue = this.max;
        const overflow = nextValue - this.max;
        this.visualOffset += overflow * 0.35; // Transfer overflow to visual stretch
      } else if (nextValue < this.min) {
        this.internalValue = this.min;
        const overflow = nextValue - this.min;
        this.visualOffset += overflow * 0.35; // Transfer overflow to visual stretch
      } else {
        this.internalValue = nextValue;
      }
    }

    this.velocity = deltaValue;
    this.updateUI();
  }

  /**
   * Handles pointerup / pointercancel event.
   * @private
   */
  onPointerUp(e) {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.input.removeEventListener('pointermove', this._onPointerMove);
    this.input.removeEventListener('pointerup', this._onPointerUp);
    this.input.removeEventListener('pointercancel', this._onPointerUp);

    try {
      this.input.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Fallback
    }

    // Direct excess velocity into spring offset if releasing at boundary
    if (this.internalValue >= this.max && this.velocity > 0) {
      this.offsetVelocity = this.velocity * 0.6;
      this.velocity = 0;
    } else if (this.internalValue <= this.min && this.velocity < 0) {
      this.offsetVelocity = this.velocity * 0.6;
      this.velocity = 0;
    }

    this.startMomentum();
  }

  /**
   * Physics loop for momentum decay and visual spring settling.
   * @private
   */
  startMomentum() {
    const step = () => {
      if (this.isDragging) return;

      // 1. Value Momentum Physics (Operates within boundaries)
      if (this.velocity !== 0) {
        this.velocity *= this._activeFriction || this.friction;
        this.internalValue += this.velocity;

        if (this.internalValue >= this.max) {
          this.internalValue = this.max;
          this.offsetVelocity = this.velocity * 0.5;
          this.velocity = 0;
        } else if (this.internalValue <= this.min) {
          this.internalValue = this.min;
          this.offsetVelocity = this.velocity * 0.5;
          this.velocity = 0;
        }

        if (Math.abs(this.velocity) <= this.stopThreshold) {
          this.velocity = 0;
        }
      }

      // 2. Visual Spring Physics (Purely aesthetic stretch return)
      if (this.visualOffset !== 0 || this.offsetVelocity !== 0) {
        this.offsetVelocity -= this.visualOffset * this.springStiffness;
        this.offsetVelocity *= this.springDamping;
        this.visualOffset += this.offsetVelocity;

        if (Math.abs(this.visualOffset) < 0.005 && Math.abs(this.offsetVelocity) < 0.005) {
          this.visualOffset = 0;
          this.offsetVelocity = 0;
        }
      }

      this.updateUI();

      if (this.velocity !== 0 || this.visualOffset !== 0 || Math.abs(this.offsetVelocity) > 0.005) {
        this.animationFrame = requestAnimationFrame(step);
      } else {
        this.stopAnimation();
      }
    };

    this.animationFrame = requestAnimationFrame(step);
  }

  /**
   * Stops active requestAnimationFrame loop.
   * @private
   */
  stopAnimation() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.updateUI();
  }

  /**
   * Synchronizes input DOM element display, progress variable `--progress`, and visual spring transform.
   * @private
   */
  updateUI() {
    // Only suppress updating input value if user is purely focused and typing (no drag or motion)
    const isActivelyTyping = (document.activeElement === this.input) && 
                             !this.isDragging && 
                             this.velocity === 0 && 
                             this.visualOffset === 0;

    if (!isActivelyTyping) {
      this.input.value = this.value;

      // Ensure cursor caret is at the end of text when element is focused during drag/momentum
      if (document.activeElement === this.input) {
        try {
          const endPos = String(this.input.value).length;
          this.input.setSelectionRange(endPos, endPos);
        } catch (err) {
          // Native <input type="number"> in Blink/WebKit ignores setSelectionRange,
          // but updating input.value on focused element natively places selection at the end.
        }
      }
    }

    // Calculate percent position for CSS background progress variable
    if (this.max !== Infinity && this.min !== -Infinity) {
      const range = this.max - this.min;
      const visualProgressValue = this.internalValue + this.visualOffset;
      const percentage = Math.max(-5, Math.min(105, ((visualProgressValue - this.min) / range) * 100));
      this.input.style.setProperty('--progress', `${percentage}%`);
    }

    // Physical elastic displacement (translateX)
    const pxShift = Math.sign(this.visualOffset) * Math.min(20, Math.abs(this.visualOffset) * 3);
    this.input.style.transform = `translateX(${pxShift.toFixed(2)}px)`;

    // Notify listener when the discrete value changes
    const current = this.value;
    if (current !== this._lastEmittedValue) {
      this._lastEmittedValue = current;
      if (this.onValueChange) this.onValueChange(current);
    }
  }

  /**
   * Destroys the component, cleans up event listeners and stops ongoing animations.
   */
  destroy() {
    this.stopAnimation();
    this.input.removeEventListener('pointerdown', this._onPointerDown);
    this.input.removeEventListener('pointermove', this._onPointerMove);
    this.input.removeEventListener('pointerup', this._onPointerUp);
    this.input.removeEventListener('pointercancel', this._onPointerUp);
    this.input.removeEventListener('input', this._onInput);
    this.input.removeEventListener('change', this._onChange);
    this.input.style.transform = '';
    this.input.style.removeProperty('--progress');
  }
}

export default ImpulseSpinner;