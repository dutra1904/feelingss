const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

const EMOTION_PT = {
  angry: "Raiva",
  disgusted: "Nojo",
  fearful: "Medo",
  happy: "Feliz",
  sad: "Triste",
  surprised: "Surpreso",
  neutral: "Neutro",
};

const GENDER_PT = {
  male: "Masculino",
  female: "Feminino",
};

const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("start");
const hint = document.getElementById("hint");
const ctx = canvas.getContext("2d");

function setStatus(text) {
  statusEl.textContent = text;
}

function dominantExpression(expressions) {
  return Object.entries(expressions).sort((a, b) => b[1] - a[1])[0][0];
}

function resizeCanvas() {
  const rect = video.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

function drawDetections(detections) {
  const displaySize = { width: canvas.width, height: canvas.height };
  const resized = faceapi.resizeResults(detections, displaySize);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#39ff14";
  ctx.fillStyle = "#ffffff";
  ctx.font = "16px Segoe UI, sans-serif";

  for (const det of resized) {
    const { x, y, width, height } = det.detection.box;
    const mirroredX = canvas.width - x - width;
    ctx.strokeRect(mirroredX, y, width, height);

    const age = Math.round(det.age);
    const emotion = EMOTION_PT[dominantExpression(det.expressions)] || "Neutro";
    const gender = GENDER_PT[det.gender] || det.gender;
    const lines = [
      `Idade: ${Math.max(0, age - 2)}-${age + 2}`,
      `Humor: ${emotion}`,
      `Sexo: ${gender} (${det.genderProbability.toFixed(2)})`,
    ];

    lines.forEach((line, i) => {
      ctx.fillText(line, mirroredX, y + height + 22 + i * 20);
    });
  }
}

async function detectLoop() {
  if (video.paused || video.ended) {
    return;
  }

  const detections = await faceapi
    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withAgeAndGender()
    .withFaceExpressions();

  drawDetections(detections);
  requestAnimationFrame(detectLoop);
}

async function startCamera() {
  startBtn.disabled = true;
  setStatus("Pedindo acesso à câmera…");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    video.style.opacity = "1";
    hint.hidden = true;
    resizeCanvas();
    setStatus("Olhe para a câmera");
    detectLoop();
  } catch (error) {
    startBtn.disabled = false;
    setStatus("Câmera bloqueada. Permita o acesso e tente de novo.");
  }
}

async function loadModels() {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
  ]);
  startBtn.disabled = false;
  setStatus("Pronto. Abra a câmera.");
}

startBtn.addEventListener("click", startCamera);
window.addEventListener("resize", resizeCanvas);
loadModels().catch(() => {
  setStatus("Falha ao carregar os modelos. Confira a internet e recarregue.");
});
