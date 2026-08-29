"""Webcam ao vivo: detecta o rosto e estima idade, humor e sexo."""

import urllib.request
from pathlib import Path

import cv2
from deepface import DeepFace

EMOTION_PT = {
    "angry": "Raiva",
    "disgust": "Nojo",
    "fear": "Medo",
    "happy": "Feliz",
    "sad": "Triste",
    "surprise": "Surpreso",
    "neutral": "Neutro",
}

GENDER_PT = {
    "Man": "Masculino",
    "Woman": "Feminino",
}

ANALYZE_EVERY_N_FRAMES = 12
BOX_COLOR = (0, 255, 0)
TEXT_COLOR = (255, 255, 255)
YUNET_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/"
    "models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
)
YUNET_PATH = Path(__file__).resolve().parent / "models" / "face_detection_yunet_2023mar.onnx"


def ensure_yunet_model():
    if YUNET_PATH.exists():
        return str(YUNET_PATH)
    YUNET_PATH.parent.mkdir(parents=True, exist_ok=True)
    print("Baixando detector de rostos (YuNet)...")
    urllib.request.urlretrieve(YUNET_URL, YUNET_PATH)
    return str(YUNET_PATH)


def create_face_detector(width, height):
    return cv2.FaceDetectorYN.create(
        ensure_yunet_model(),
        "",
        (width, height),
        score_threshold=0.6,
        nms_threshold=0.3,
        top_k=5000,
    )


def analyze_face(face_bgr):
    result = DeepFace.analyze(
        face_bgr,
        actions=["age", "gender", "emotion"],
        detector_backend="skip",
        enforce_detection=False,
        silent=True,
    )
    if isinstance(result, list):
        result = result[0]

    age = int(result.get("age", 0))
    gender = result.get("dominant_gender", "unknown")
    emotion = result.get("dominant_emotion", "unknown")

    gender_scores = result.get("gender") or {}
    raw_conf = gender_scores.get(gender, 0)
    gender_conf = raw_conf / 100.0 if raw_conf > 1 else raw_conf

    return {
        "age": age,
        "gender": GENDER_PT.get(gender, gender),
        "gender_conf": gender_conf,
        "emotion": EMOTION_PT.get(emotion, emotion),
    }


def draw_label(frame, x, y, lines):
    for i, line in enumerate(lines):
        cv2.putText(
            frame,
            line,
            (x, y + i * 22),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            TEXT_COLOR,
            2,
            cv2.LINE_AA,
        )


def main():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Nao foi possivel abrir a webcam. Feche outros apps que a usam.")

    ok, frame = cap.read()
    if not ok:
        raise RuntimeError("A webcam abriu, mas nao enviou nenhum frame.")

    detector = create_face_detector(frame.shape[1], frame.shape[0])
    last_attrs = {}
    frame_i = 0

    print("feelingss rodando. Aperte Q para sair.")

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        frame = cv2.flip(frame, 1)
        detector.setInputSize((frame.shape[1], frame.shape[0]))
        _, faces = detector.detect(frame)
        if faces is None:
            faces = []

        current_ids = set()
        for i, face in enumerate(faces):
            current_ids.add(i)
            x, y, w, h = [int(v) for v in face[:4]]
            x, y = max(0, x), max(0, y)
            w = min(w, frame.shape[1] - x)
            h = min(h, frame.shape[0] - y)
            if w < 40 or h < 40:
                continue

            cv2.rectangle(frame, (x, y), (x + w, y + h), BOX_COLOR, 2)

            should_analyze = i not in last_attrs or frame_i % ANALYZE_EVERY_N_FRAMES == 0
            if should_analyze:
                pad = 10
                y1, y2 = max(0, y - pad), min(frame.shape[0], y + h + pad)
                x1, x2 = max(0, x - pad), min(frame.shape[1], x + w + pad)
                crop = frame[y1:y2, x1:x2]
                if crop.size > 0:
                    try:
                        last_attrs[i] = analyze_face(crop)
                    except Exception:
                        pass

            attrs = last_attrs.get(i)
            if attrs:
                age_lo = max(0, attrs["age"] - 2)
                age_hi = attrs["age"] + 2
                draw_label(
                    frame,
                    x,
                    y + h + 22,
                    [
                        f"Idade: {age_lo}-{age_hi}",
                        f"Humor: {attrs['emotion']}",
                        f"Sexo: {attrs['gender']} ({attrs['gender_conf']:.2f})",
                    ],
                )

        last_attrs = {i: last_attrs[i] for i in current_ids if i in last_attrs}
        cv2.imshow("feelingss", frame)

        if cv2.waitKey(1) & 0xFF in (ord("q"), ord("Q")):
            break
        frame_i += 1

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
