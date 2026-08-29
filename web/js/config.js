export const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

export const EMOTION_PT = {
  angry: "Raiva",
  disgusted: "Nojo",
  disgust: "Nojo",
  fearful: "Medo",
  fear: "Medo",
  happy: "Feliz",
  sad: "Triste",
  surprise: "Surpreso",
  surprised: "Surpreso",
  neutral: "Neutro",
};

export const SAMPLE_WINDOW = 18;
export const GENDER_MIN_CONF = 0.72;
export const EMOTION_MIN_SCORE = 0.4;
export const BOX_SMOOTH = 0.28;
export const MATCH_IOU = 0.25;
export const MAX_MISSED = 8;
export const DARK_LUMA = 62;
export const SIDE_YAW = 0.68;
export const DETECT_MIN_SCORE = 0.58;
export const QUALITY_WINDOW = 6;
export const LOOP_MS = 90;

export const DETECT_OPTIONS = { inputSize: 512, scoreThreshold: 0.32 };
export const PHOTO_SSD = { minConfidence: 0.3, maxResults: 40 };
export const PHOTO_TINY = { inputSize: 608, scoreThreshold: 0.15 };
export const PHOTO_NMS_IOU = 0.38;
export const PHOTO_MIN_FACE = 22;
export const PHOTO_MIN_FACE_RATIO = 0.02;
export const PHOTO_MAX_FACES = 24;
export const PHOTO_CROP_MIN_SCORE = 0.28;
