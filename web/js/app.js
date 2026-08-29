import { EMOTION_PT, LOOP_MS } from "./config.js";
import { detectFaces, detectPhotoFaces, loadModels } from "./detect.js";
import { fitRect, mapBox } from "./geometry.js";
import { assessQuality, topExpression } from "./quality.js";
import { createRenderers, drawBoxes, resizeOverlay } from "./render.js";
import { FaceTracker, genderFromDet } from "./tracker.js";

const video = document.getElementById("video");
const still = document.getElementById("still");
const canvas = document.getElementById("overlay");
const hud = document.getElementById("hud");
const frame = document.getElementById("frame");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("start");
const photoInput = document.getElementById("photo");
const hint = document.getElementById("hint");
const readout = document.getElementById("readout");
const ctx = canvas.getContext("2d");
const { renderHud, renderReadout, statusFromSnapshots } = createRenderers(EMOTION_PT);

const tracker = new FaceTracker();

let mode = "idle";
let modelsReady = false;
let liveGen = 0;
let photoGen = 0;
let photoImage = null;
let photoResults = [];
let photoObjectUrl = null;
let lastSnapshots = [];
let highlightIndex = null;
let hoverLock = false;

function setStatus(text) {
  statusEl.textContent = text;
}

function setHint(visible, text = "Abra a câmera ou envie uma foto.") {
  hint.textContent = text;
  hint.hidden = !visible;
}

function setLiveButton() {
  startBtn.textContent = mode === "live" ? "Encerrar câmera" : "Abrir câmera";
  startBtn.setAttribute("aria-pressed", mode === "live" ? "true" : "false");
}

function applyHighlight(index) {
  highlightIndex = index;
  drawBoxes(ctx, lastSnapshots, highlightIndex);
  hud.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("is-active", Number(chip.dataset.index) === index);
  });
  readout.querySelectorAll(".face-card").forEach((card) => {
    card.classList.toggle("is-active", Number(card.dataset.index) === index);
  });
}

function highlightFromScroll() {
  const cards = [...readout.querySelectorAll(".face-card")];
  if (!cards.length) {
    return;
  }
  const root = readout.getBoundingClientRect();
  const focusY = root.top + Math.min(110, root.height * 0.3);
  let best = 0;
  let bestDist = Infinity;
  cards.forEach((card) => {
    const index = Number(card.dataset.index);
    const dist = Math.abs(card.getBoundingClientRect().top - focusY);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  applyHighlight(best);
}

function paint(snapshots) {
  lastSnapshots = snapshots;
  const active = mode === "photo" ? highlightIndex : null;
  drawBoxes(ctx, snapshots, active);
  renderHud(hud, snapshots, active);
  renderReadout(readout, snapshots);
  if (mode === "photo" && highlightIndex !== null) {
    applyHighlight(highlightIndex);
  }
}

function clearScene() {
  lastSnapshots = [];
  highlightIndex = null;
  hoverLock = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hud.replaceChildren();
  renderReadout(readout, []);
}

function releasePhotoUrl() {
  if (photoObjectUrl) {
    URL.revokeObjectURL(photoObjectUrl);
    photoObjectUrl = null;
  }
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

function mapDetection(det, source, fitMode, mirror) {
  const { w, h } = sourceSize(source);
  const fit = fitRect(w, h, canvas.width, canvas.height, fitMode);
  return mapBox(det.detection.box, fit, canvas.width, mirror);
}

function paintPhoto() {
  if (!photoImage) {
    return;
  }
  const snapshots = photoResults.map((item, index) => ({
    id: index + 1,
    box: mapDetection(item.det, photoImage, "contain", false),
    age: item.age,
    emotion: item.emotion,
    gender: item.gender,
    quality: item.quality,
  }));
  paint(snapshots);
  setStatus(statusFromSnapshots(snapshots, " · foto"));
}

function stopCamera() {
  liveGen += 1;
  const stream = video.srcObject;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  video.srcObject = null;
  video.classList.remove("is-on");
  if (mode === "live") {
    mode = "idle";
  }
  setLiveButton();
}

function hideStill() {
  still.classList.remove("is-on");
  still.removeAttribute("src");
  releasePhotoUrl();
}

async function analyzePhoto(img) {
  const gen = ++photoGen;
  photoImage = img;
  photoResults = [];
  highlightIndex = null;
  hoverLock = false;
  mode = "photo";
  tracker.reset();
  stopCamera();
  still.classList.add("is-on");
  setHint(false);
  resizeOverlay(canvas, frame);
  setStatus("Analisando a foto…");
  setLiveButton();

  const detections = await detectPhotoFaces(img, (msg) => {
    if (gen === photoGen) {
      setStatus(msg);
    }
  });
  if (gen !== photoGen || mode !== "photo") {
    return;
  }

  photoResults = detections.map((det) => ({
    det,
    age: det.age,
    emotion: topExpression(det.expressions)[0],
    gender: genderFromDet(det),
    quality: assessQuality(det, img),
  }));
  paintPhoto();
}

async function onPhotoFile(file) {
  if (!modelsReady) {
    return;
  }
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Envie um arquivo de imagem (jpg, png, webp).");
    return;
  }

  const nextUrl = URL.createObjectURL(file);
  const previousUrl = photoObjectUrl;
  photoObjectUrl = nextUrl;
  still.onload = async () => {
    still.onload = null;
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    try {
      await analyzePhoto(still);
    } catch {
      setStatus("Não deu para analisar essa imagem.");
    }
  };
  still.onerror = () => {
    still.onerror = null;
    URL.revokeObjectURL(nextUrl);
    if (photoObjectUrl === nextUrl) {
      photoObjectUrl = null;
    }
    setStatus("Não deu para abrir essa imagem.");
  };
  still.src = nextUrl;
}

async function detectLoop(gen) {
  if (gen !== liveGen || mode !== "live" || video.paused || video.ended) {
    return;
  }

  try {
    resizeOverlay(canvas, frame);
    const detections = await detectFaces(video);
    if (gen !== liveGen || mode !== "live") {
      return;
    }
    const snapshots = tracker.match(
      detections,
      (det) => mapDetection(det, video, "cover", true),
      video,
    );
    paint(snapshots);
    setStatus(statusFromSnapshots(snapshots));
  } catch {
    if (gen === liveGen && mode === "live") {
      setStatus("Falha na detecção. Tentando de novo…");
    }
  }

  window.setTimeout(() => {
    if (gen === liveGen) {
      requestAnimationFrame(() => detectLoop(gen));
    }
  }, LOOP_MS);
}

async function startCamera() {
  if (mode === "live") {
    stopCamera();
    tracker.reset();
    clearScene();
    setHint(true);
    setStatus("Câmera encerrada.");
    return;
  }

  startBtn.disabled = true;
  mode = "idle";
  photoGen += 1;
  photoImage = null;
  photoResults = [];
  photoInput.value = "";
  hideStill();
  tracker.reset();
  clearScene();
  setStatus("Pedindo acesso à câmera…");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    if (video.readyState < 2) {
      await new Promise((resolve) => {
        video.addEventListener("loadeddata", resolve, { once: true });
      });
    }
    await video.play();
    video.classList.add("is-on");
    setHint(false);
    resizeOverlay(canvas, frame);
    mode = "live";
    setLiveButton();
    startBtn.disabled = false;
    setStatus("Olhe para a câmera — pode haver mais de uma pessoa.");
    detectLoop(++liveGen);
  } catch {
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
    video.classList.remove("is-on");
    startBtn.disabled = false;
    mode = "idle";
    setLiveButton();
    setHint(true);
    setStatus("Câmera bloqueada. Envie uma foto ou tente de novo.");
  }
}

startBtn.addEventListener("click", startCamera);
photoInput.addEventListener("change", (event) => {
  onPhotoFile(event.target.files[0]);
});

frame.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (modelsReady) {
    frame.classList.add("is-drop");
  }
});
frame.addEventListener("dragleave", () => {
  frame.classList.remove("is-drop");
});
frame.addEventListener("drop", (event) => {
  event.preventDefault();
  frame.classList.remove("is-drop");
  onPhotoFile(event.dataTransfer.files[0]);
});

readout.addEventListener("pointerover", (event) => {
  const card = event.target.closest(".face-card");
  if (!card || mode !== "photo") {
    return;
  }
  hoverLock = true;
  applyHighlight(Number(card.dataset.index));
});

readout.addEventListener("pointerleave", () => {
  hoverLock = false;
});

readout.addEventListener("scroll", () => {
  if (mode !== "photo" || hoverLock) {
    return;
  }
  highlightFromScroll();
});

hud.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip || mode !== "photo") {
    return;
  }
  const index = Number(chip.dataset.index);
  applyHighlight(index);
  readout.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
});

window.addEventListener("resize", () => {
  resizeOverlay(canvas, frame);
  if (mode === "photo" && photoImage) {
    paintPhoto();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && mode === "live") {
    stopCamera();
    clearScene();
    setHint(true);
    setStatus("Câmera pausada ao sair da aba.");
  }
});

loadModels((step) => setStatus(`Carregando ${step}…`))
  .then(() => {
    modelsReady = true;
    startBtn.disabled = false;
    photoInput.disabled = false;
    setStatus("Pronto. Abra a câmera ou envie uma foto.");
  })
  .catch(() => {
    setStatus("Falha ao carregar os modelos. Confira a internet e recarregue.");
  });
