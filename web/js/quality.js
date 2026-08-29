import { DARK_LUMA, DETECT_MIN_SCORE, SIDE_YAW } from "./config.js";

const probe = document.createElement("canvas");
const probeCtx = probe.getContext("2d", { willReadFrequently: true });
probe.width = 32;
probe.height = 32;

export function topExpression(expressions = {}) {
  const entries = Object.entries(expressions);
  if (!entries.length) {
    return ["neutral", 0];
  }
  return entries.sort((a, b) => b[1] - a[1])[0];
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function landmarkPoints(landmarks) {
  if (!landmarks) {
    return [];
  }
  if (landmarks.positions?.length) {
    return landmarks.positions;
  }
  if (typeof landmarks.getPositions === "function") {
    return landmarks.getPositions();
  }
  return [];
}

function faceYawRatio(landmarks) {
  const points = landmarkPoints(landmarks);
  if (points.length < 46) {
    return 1;
  }
  const leftEye = midpoint(points[36], points[39]);
  const rightEye = midpoint(points[42], points[45]);
  const nose = points[30];
  const left = Math.hypot(nose.x - leftEye.x, nose.y - leftEye.y);
  const right = Math.hypot(nose.x - rightEye.x, nose.y - rightEye.y);
  const longest = Math.max(left, right);
  return longest === 0 ? 1 : Math.min(left, right) / longest;
}

export function faceBrightness(box, source) {
  if (!source) {
    return 128;
  }

  const srcW = source.videoWidth || source.naturalWidth || source.width;
  const srcH = source.videoHeight || source.naturalHeight || source.height;
  if (!srcW || !srcH) {
    return 128;
  }

  const sx = Math.max(0, Math.floor(box.x));
  const sy = Math.max(0, Math.floor(box.y));
  const sw = Math.max(1, Math.min(Math.floor(box.width), srcW - sx));
  const sh = Math.max(1, Math.min(Math.floor(box.height), srcH - sy));
  if (sw < 1 || sh < 1) {
    return 128;
  }

  probeCtx.drawImage(source, sx, sy, sw, sh, 0, 0, probe.width, probe.height);
  const pixels = probeCtx.getImageData(0, 0, probe.width, probe.height).data;
  let luma = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    luma += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }
  return luma / (pixels.length / 4);
}

export function flagsToWarnings({ dark, side, lowConf }) {
  const warnings = [];
  if (dark) {
    warnings.push("Luz fraca");
  }
  if (side) {
    warnings.push("Rosto de lado");
  }
  if (lowConf) {
    warnings.push("Confiança baixa");
  }
  return warnings;
}

export function assessQuality(det, source) {
  const [, emotionScore] = topExpression(det.expressions);
  const dark = faceBrightness(det.detection.box, source) < DARK_LUMA;
  const side = faceYawRatio(det.landmarks) < SIDE_YAW;
  const lowConf =
    det.detection.score < DETECT_MIN_SCORE ||
    det.genderProbability < 0.65 ||
    emotionScore < 0.35;
  const flags = { dark, side, lowConf };
  return { ...flags, warnings: flagsToWarnings(flags) };
}

export function majorityFlag(votes) {
  if (!votes.length) {
    return false;
  }
  return votes.filter(Boolean).length >= Math.ceil(votes.length / 2);
}
