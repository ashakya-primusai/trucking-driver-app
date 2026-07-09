/**
 * Speed estimate from DeviceMotion (accelerometer), integrated along travel bearing.
 * Used when GPS does not provide coords.speed. Corrected when GPS/position speed is known.
 */

const MAX_SPEED_MS = 150 / 3.6; // ~150 km/h
const MIN_DT_SEC = 0.05;
const MAX_DT_SEC = 2;
const FRICTION = 0.92;
const STATIONARY_ACC_MS2 = 0.35;
const STATIONARY_SPEED_MS = 0.8;

type OrientationSample = {
  alpha: number;
  beta: number;
  gamma: number;
};

let listening = false;
let velocityMs = 0;
let bearingRad: number | null = null;
let lastMotionTs = 0;
let orientation: OrientationSample | null = null;
let motionHandler: ((e: DeviceMotionEvent) => void) | null = null;
let orientHandler: ((e: DeviceOrientationEvent) => void) | null = null;

function clampVelocity(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(v, MAX_SPEED_MS);
}

/** Bearing in radians (0 = north, clockwise). */
export function bearingRadFromSamples(from: { lng: number; lat: number }, to: { lng: number; lat: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.atan2(y, x);
}

export function setMotionTravelBearing(rad: number | null): void {
  if (rad != null && Number.isFinite(rad)) {
    bearingRad = rad;
  }
}

/** Snap integrated speed to a trusted GPS or position-derived value (km/h). */
export function syncMotionSpeedFromGps(speedKmh: number | null | undefined): void {
  if (speedKmh == null || !Number.isFinite(speedKmh) || speedKmh < 0) return;
  velocityMs = clampVelocity(speedKmh / 3.6);
}

export function getMotionSpeedKmh(): number | null {
  if (!listening || velocityMs <= 0) return null;
  return Math.round(velocityMs * 3.6 * 10) / 10;
}

function horizontalAccelerationMs2(e: DeviceMotionEvent): { ax: number; ay: number } | null {
  const acc = e.acceleration;
  if (acc && acc.x != null && acc.y != null) {
    return { ax: acc.x, ay: acc.y };
  }

  const withG = e.accelerationIncludingGravity;
  if (!withG || withG.x == null || withG.y == null || withG.z == null || !orientation) {
    return null;
  }

  const beta = (orientation.beta * Math.PI) / 180;
  const gamma = (orientation.gamma * Math.PI) / 180;

  const cosB = Math.cos(beta);
  const sinB = Math.sin(beta);
  const cosG = Math.cos(gamma);
  const sinG = Math.sin(gamma);

  const gx = -9.81 * sinB * cosG;
  const gy = 9.81 * sinG;
  const gz = 9.81 * cosB * cosG;

  return {
    ax: withG.x - gx,
    ay: withG.y - gy,
  };
}

function onDeviceMotion(e: DeviceMotionEvent): void {
  const ts = e.timeStamp > 0 ? e.timeStamp : Date.now();
  if (lastMotionTs <= 0) {
    lastMotionTs = ts;
    return;
  }

  let dt = (ts - lastMotionTs) / 1000;
  lastMotionTs = ts;
  if (dt < MIN_DT_SEC || dt > MAX_DT_SEC) return;

  const horiz = horizontalAccelerationMs2(e);
  if (!horiz) return;

  let forwardAcc = Math.sqrt(horiz.ax * horiz.ax + horiz.ay * horiz.ay);

  if (bearingRad != null) {
    const alpha = orientation ? (orientation.alpha * Math.PI) / 180 : bearingRad;
    const cosA = Math.cos(alpha);
    const sinA = Math.sin(alpha);
    const east = horiz.ax * cosA + horiz.ay * sinA;
    const north = -horiz.ax * sinA + horiz.ay * cosA;
    const bearingCos = Math.cos(bearingRad);
    const bearingSin = Math.sin(bearingRad);
    forwardAcc = east * bearingSin + north * bearingCos;
  }

  if (Math.abs(forwardAcc) < STATIONARY_ACC_MS2) {
    if (velocityMs < STATIONARY_SPEED_MS) {
      velocityMs = 0;
    } else {
      velocityMs *= FRICTION;
    }
    return;
  }

  velocityMs = clampVelocity(velocityMs + forwardAcc * dt);
}

function onDeviceOrientation(e: DeviceOrientationEvent): void {
  if (e.alpha == null || e.beta == null || e.gamma == null) return;
  orientation = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
}

export function isMotionSpeedSupported(): boolean {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

/** iOS 13+ may require a user-gesture permission prompt. */
export async function requestMotionPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const DM = DeviceMotionEvent as typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<"granted" | "denied" | "default">;
  };
  if (typeof DM.requestPermission === "function") {
    try {
      const result = await DM.requestPermission();
      return result === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

export function startMotionSpeedTracker(): void {
  if (typeof window === "undefined" || listening) return;

  motionHandler = onDeviceMotion;
  orientHandler = onDeviceOrientation;

  window.addEventListener("devicemotion", motionHandler);
  window.addEventListener("deviceorientation", orientHandler);
  listening = true;
  lastMotionTs = 0;
}

export function stopMotionSpeedTracker(): void {
  if (typeof window === "undefined" || !listening) return;

  if (motionHandler) {
    window.removeEventListener("devicemotion", motionHandler);
    motionHandler = null;
  }
  if (orientHandler) {
    window.removeEventListener("deviceorientation", orientHandler);
    orientHandler = null;
  }

  listening = false;
  velocityMs = 0;
  bearingRad = null;
  orientation = null;
  lastMotionTs = 0;
}
