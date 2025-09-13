import * as m from "./math.js";

function coordsInCurrentTarget(e, targetOverride = null) {
  const r = (targetOverride || e.currentTarget).getBoundingClientRect();
  return [e.clientX - r.x, e.clientY - r.y, 0, 1];
}
function nonPrimaryMouseButtonPointerEvent(e) {
  return e instanceof PointerEvent && e.pointerType === "mouse" && e.button !== 0;
}
export class ScrollZoom {
  clickHandler;
  #pointerDown;
  #pointerMove;
  #pointerCancel;
  #pointerUp;
  #wheel;

  constructor(view) {
    this.viewMatrix = m.uniformScale(1);
    this.view = view;
    this.image = this.view.querySelector("*");
    this.pointerState = new Map();
    this.singlePointerDownEvent = null;
    this.quantize = true;
    this.#pointerDown = e => {
      if (nonPrimaryMouseButtonPointerEvent(e)) return;
      if (this.pointerState.size === 0) {
        this.singlePointerDownEvent = e;
        if (this.dragFilter && !this.dragFilter(e)) return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      this.pointerState.set(e.pointerId, { event: e });
      e.preventDefault();
    };
    this.#pointerMove = e => {
      const lastState = this.pointerState.get(e.pointerId);
      if (!lastState)
        return;
      const before = coordsInCurrentTarget(lastState.event, this.view);
      const now = coordsInCurrentTarget(e, this.view);
      if (this.pointerState.size === 1) {
        if (this.longDragHandler &&
          (lastState.longDrag ||
          lastState.event.type === "pointerdown" &&
          e.timeStamp - lastState.event.timeStamp > 300)) {
          this.longDragHandler(e, lastState.event, lastState.event.type === "pointerdown");
          lastState.longDrag = true;
        } else {
          const delta = m.sub(now, before);
          this.viewMatrix = m.multiplyMatrices(m.translation(delta), this.viewMatrix);
          this.constrainAndApply();
        }
      }
      else if (this.pointerState.size === 2) {
        for (let otherState of this.pointerState.values()) {
          const otherEvent = otherState.event;
          if (otherEvent.pointerId !== e.pointerId) {
            const origin = coordsInCurrentTarget(otherEvent, this.view);
            const deltaScale = m.vectorLength(m.sub(now, origin)) / m.vectorLength(m.sub(before, origin));
            const centerBefore = m.scale(m.add(before, origin), 0.5);
            const centerNow = m.scale(m.add(now, origin), 0.5);
            this.scaleAroundClientCoordinates(origin, deltaScale);
            const delta = m.sub(centerNow, centerBefore);
            this.viewMatrix = m.multiplyMatrices(m.translation(delta), this.viewMatrix);
            this.constrainAndApply();
          }
        }
      }
      lastState.event = e;
    };
    this.#pointerCancel = e => {
      this.pointerState.delete(e.pointerId);
      e.currentTarget.releasePointerCapture(e.pointerId);
      this.singlePointerDownEvent = null;
    };
    this.#pointerUp = e => {
      this.pointerState.delete(e.pointerId);
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (this.clickHandler && !this.pointerState.size &&
        this.singlePointerDownEvent !== null &&
        e.timeStamp - this.singlePointerDownEvent.timeStamp < 200) {
        this.clickHandler(this.singlePointerDownEvent);
      }
      this.singlePointerDownEvent = null;
    };
    this.#wheel = e => {
      const deltaScale = Math.pow(2, -e.deltaY / 512);
      this.scaleAroundClientCoordinates(coordsInCurrentTarget(e), deltaScale);
      this.constrainAndApply();
      e.preventDefault();
      this.singlePointerDownEvent = null;
    };
    view.addEventListener("pointerdown", this.#pointerDown);
    view.addEventListener("pointermove", this.#pointerMove);
    view.addEventListener("pointercancel", this.#pointerCancel);
    view.addEventListener("pointerup", this.#pointerUp);
    view.addEventListener("wheel", this.#wheel);
  }
  detach() {
    const view = this.view;
    view.removeEventListener("pointerdown", this.#pointerDown);
    view.removeEventListener("pointermove", this.#pointerMove);
    view.removeEventListener("pointercancel", this.#pointerCancel);
    view.removeEventListener("pointerup", this.#pointerUp);
    view.removeEventListener("wheel", this.#wheel);
  }
  centerImage() {
    const center = m.multiplyMatrixAndVector(this.viewMatrix, [
      this.image.offsetWidth * 0.5,
      this.image.offsetHeight * 0.5,
      0,
      1,
    ]);
    this.viewMatrix[12] += this.view.offsetWidth * 0.5 - center[0];
    this.viewMatrix[13] += this.view.offsetHeight * 0.5 - center[1];
    this.constrainAndApply();
  }
  scaleAroundCenter(deltaScale) {
    const center = m.multiplyMatrixAndVector(this.viewMatrix, [
      this.image.offsetWidth * 0.5,
      this.image.offsetHeight * 0.5,
      0,
      1,
    ]);
    this.scaleAroundClientCoordinates(center, deltaScale);
    this.constrainAndApply();
  }
  scaleAroundClientCoordinates(coords, deltaScale) {
    const negOffset = m.scale(coords, -1);
    const offset = coords;
    const transformMatrix = m.multiplyArrayOfMatrices([m.translation(offset), m.uniformScale(deltaScale), m.translation(negOffset)]);
    this.viewMatrix = m.multiplyMatrices(transformMatrix, this.viewMatrix);
  }
  constrainAndApply() {
    this.applyMatrixConstraints();
    const matrix = this.quantizeIfNeeded(this.viewMatrix);
    this.image.style.transform = m.matrixArrayToCssMatrix(matrix);
    if (this.matrixChangeHandler) {
      const matrixToPass = matrix === this.viewMatrix ? Array.from(matrix) : matrix;
      this.matrixChangeHandler(matrixToPass);
    }
  }
  applyMatrixConstraints() {
    if (this.viewMatrix[12] * 2 > this.view.offsetWidth) {
      this.viewMatrix[12] = this.view.offsetWidth * 0.5;
    }
    if (this.viewMatrix[13] * 2 > this.view.offsetHeight) {
      this.viewMatrix[13] = this.view.offsetHeight * 0.5;
    }
    const bottomRight = m.multiplyMatrixAndVector(this.viewMatrix, [
      this.image.offsetWidth,
      this.image.offsetHeight,
      0,
      1,
    ]);
    if (bottomRight[0] * 2 < this.view.offsetWidth) {
      this.viewMatrix[12] += this.view.offsetWidth * 0.5 - bottomRight[0];
    }
    if (bottomRight[1] * 2 < this.view.offsetHeight) {
      this.viewMatrix[13] += this.view.offsetHeight * 0.5 - bottomRight[1];
    }
  }
  quantizeIfNeeded(matrix) {
    if (!this.quantize) return matrix;
    matrix = Array.from(matrix);
    matrix[12] |= 0;
    matrix[13] |= 0;
    return matrix;
  }
}