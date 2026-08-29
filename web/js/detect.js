import {
  DETECT_OPTIONS,
  MODEL_URL,
  PHOTO_CROP_MIN_SCORE,
  PHOTO_MAX_FACES,
  PHOTO_MIN_FACE,
  PHOTO_MIN_FACE_RATIO,
  PHOTO_NMS_IOU,
  PHOTO_SSD,
} from "./config.js";
import { boxIntersectionArea, boxIou } from "./geometry.js";

function api() {
  const faceapi = window.faceapi;
  if (!faceapi) {
    throw new Error("face-api não carregou");
  }
  return faceapi;
}

function sourceSize(source) {
  if (source instanceof HTMLVideoElement) {
    return { w: source.videoWidth, h: source.videoHeight };
  }
  return {
    w: source.naturalWidth || source.width,
    h: source.naturalHeight || source.height,
  };
}

function toBox(det, dx = 0, dy = 0) {
  const raw = det.box || det.detection?.box;
  return {
    x: raw.x + dx,
    y: raw.y + dy,
    width: raw.width,
    height: raw.height,
    score: det.score ?? det.detection?.score ?? 0,
  };
}

function suppressContained(boxes) {
  return boxes.filter((box, index) => {
    const area = box.width * box.height;
    return !boxes.some((other, otherIndex) => {
      if (index === otherIndex) {
        return false;
      }
      const otherArea = other.width * other.height;
      if (area >= otherArea * 0.9) {
        return false;
      }
      return boxIntersectionArea(box, other) / area > 0.72;
    });
  });
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function isPlausibleFace(det) {
  const box = det.detection.box;
  const ratio = box.width / Math.max(1, box.height);
  if (ratio < 0.55 || ratio > 1.55) {
    return false;
  }

  const points = det.landmarks?.positions || [];
  if (points.length < 68) {
    return false;
  }

  const leftEye = midpoint(points[36], points[39]);
  const rightEye = midpoint(points[42], points[45]);
  const nose = points[30];
  const mouth = midpoint(points[48], points[54]);
  const iod = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (iod < box.width * 0.16 || iod > box.width * 0.82) {
    return false;
  }
  if (!(leftEye.y < nose.y && rightEye.y < nose.y && nose.y < mouth.y + box.height * 0.05)) {
    return false;
  }

  const score = det.detection.score ?? 0;
  if (score < PHOTO_CROP_MIN_SCORE && !det.age) {
    return false;
  }
  if (!det.age || det.gender === "unknown") {
    return false;
  }
  return true;
}

function nms(boxes, iouThresh = PHOTO_NMS_IOU) {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept = [];
  for (const box of sorted) {
    if (kept.every((item) => boxIou(item, box) < iouThresh)) {
      kept.push(box);
    }
  }
  return kept;
}

function makeTiles(w, h) {
  const tiles = [{ x: 0, y: 0, w, h }];
  const shortSide = Math.min(w, h);
  if (shortSide < 520) {
    return tiles;
  }

  const cols = w >= h ? 3 : 2;
  const rows = h > w * 1.05 ? 3 : 2;
  const overlap = 0.3;
  const tileW = w / (cols - (cols - 1) * overlap);
  const tileH = h / (rows - (rows - 1) * overlap);
  const stepX = tileW * (1 - overlap);
  const stepY = tileH * (1 - overlap);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = Math.round(col * stepX);
      const y = Math.round(row * stepY);
      const tw = Math.min(Math.round(tileW), w - x);
      const th = Math.min(Math.round(tileH), h - y);
      if (tw >= 160 && th >= 160 && !(x === 0 && y === 0 && tw === w && th === h)) {
        tiles.push({ x, y, w: tw, h: th });
      }
    }
  }
  return tiles;
}

function sliceCanvas(source, tile) {
  const canvas = document.createElement("canvas");
  canvas.width = tile.w;
  canvas.height = tile.h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, tile.x, tile.y, tile.w, tile.h, 0, 0, tile.w, tile.h);
  return canvas;
}

function cropPadded(source, box, pad = 0.4) {
  const { w: srcW, h: srcH } = sourceSize(source);
  const px = box.width * pad;
  const py = box.height * pad;
  const x = Math.max(0, Math.floor(box.x - px));
  const y = Math.max(0, Math.floor(box.y - py));
  const w = Math.max(1, Math.min(srcW - x, Math.ceil(box.width + px * 2)));
  const h = Math.max(1, Math.min(srcH - y, Math.ceil(box.height + py * 2)));

  const minSize = 176;
  const scale = Math.max(1, minSize / Math.min(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return { canvas, ox: x, oy: y, scale };
}

function shiftLandmarks(landmarks, ox, oy, scale) {
  if (!landmarks) {
    return { positions: [] };
  }
  const points = landmarks.positions || (typeof landmarks.getPositions === "function" ? landmarks.getPositions() : []);
  return {
    positions: points.map((point) => ({
      x: ox + point.x / scale,
      y: oy + point.y / scale,
    })),
  };
}

export async function loadModels(onStep) {
  const faceapi = api();
  const steps = [
    ["tinyFaceDetector", "Detector rápido"],
    ["ssdMobilenetv1", "Detector de grupo"],
    ["faceLandmark68Net", "Pontos do rosto"],
    ["ageGenderNet", "Idade e sexo"],
    ["faceExpressionNet", "Expressão"],
  ];

  for (let i = 0; i < steps.length; i += 1) {
    const [net, label] = steps[i];
    onStep?.(`${label} (${i + 1}/${steps.length})`);
    await faceapi.nets[net].loadFromUri(MODEL_URL);
  }
}

export async function detectFaces(input) {
  const faceapi = api();
  return faceapi
    .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions(DETECT_OPTIONS))
    .withFaceLandmarks()
    .withAgeAndGender()
    .withFaceExpressions();
}

async function detectBoxesOn(input, dx, dy) {
  const faceapi = api();
  const dets = await faceapi.detectAllFaces(input, new faceapi.SsdMobilenetv1Options(PHOTO_SSD));
  return dets.map((det) => toBox(det, dx, dy));
}

function isFullFrame(tile, w, h) {
  return tile.x === 0 && tile.y === 0 && tile.w === w && tile.h === h;
}

async function collectPhotoBoxes(source, onStep) {
  const { w, h } = sourceSize(source);
  const tiles = makeTiles(w, h);
  const found = [];

  for (let i = 0; i < tiles.length; i += 1) {
    onStep?.(`Procurando rostos (${i + 1}/${tiles.length})…`);
    const tile = tiles[i];
    const canvas = isFullFrame(tile, w, h) ? source : sliceCanvas(source, tile);
    const boxes = await detectBoxesOn(canvas, tile.x, tile.y);
    found.push(...boxes);
  }

  const minSide = Math.min(w, h);
  const minFace = Math.max(PHOTO_MIN_FACE, minSide * PHOTO_MIN_FACE_RATIO);

  return suppressContained(nms(found))
    .filter((box) => box.width >= minFace && box.height >= minFace)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, PHOTO_MAX_FACES);
}

async function describeBox(source, box) {
  const faceapi = api();
  const { canvas, ox, oy, scale } = cropPadded(source, box);
  let detailed = await faceapi
    .detectSingleFace(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.22, maxResults: 1 }))
    .withFaceLandmarks()
    .withAgeAndGender()
    .withFaceExpressions();

  if (!detailed) {
    return null;
  }

  const result = {
    detection: { box, score: Math.max(box.score, detailed.detection.score) },
    landmarks: shiftLandmarks(detailed.landmarks, ox, oy, scale),
    age: detailed.age,
    gender: detailed.gender,
    genderProbability: detailed.genderProbability,
    expressions: detailed.expressions,
  };
  return isPlausibleFace(result) ? result : null;
}

export async function detectPhotoFaces(source, onStep) {
  const boxes = await collectPhotoBoxes(source, onStep);
  const results = [];
  for (let i = 0; i < boxes.length; i += 1) {
    onStep?.(`Lendo rosto ${i + 1} de ${boxes.length}…`);
    const described = await describeBox(source, boxes[i]);
    if (described) {
      results.push(described);
    }
  }
  return results;
}
