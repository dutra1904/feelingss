import {
  BOX_SMOOTH,
  EMOTION_MIN_SCORE,
  GENDER_MIN_CONF,
  MATCH_IOU,
  MAX_MISSED,
  QUALITY_WINDOW,
  SAMPLE_WINDOW,
} from "./config.js";
import { boxIou, smoothBox } from "./geometry.js";
import { assessQuality, flagsToWarnings, majorityFlag, topExpression } from "./quality.js";

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mostCommon(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function pushWindow(list, value, max) {
  list.push(value);
  if (list.length > max) {
    list.shift();
  }
}

function readGender(track) {
  if (track.genderVotes.length < 8) {
    return { label: "Avaliando…", conf: 0 };
  }

  let female = 0;
  let male = 0;
  for (const vote of track.genderVotes) {
    if (vote.gender === "female") {
      female += vote.p;
    } else {
      male += vote.p;
    }
  }

  const total = female + male;
  if (total <= 0) {
    return { label: "Indefinido", conf: 0 };
  }

  const conf = Math.max(female, male) / total;
  if (conf < GENDER_MIN_CONF) {
    return { label: "Indefinido", conf };
  }
  return {
    label: female > male ? "Feminino" : "Masculino",
    conf,
  };
}

function readQuality(track) {
  const dark = majorityFlag(track.quality.dark);
  const side = majorityFlag(track.quality.side);
  const lowConf = majorityFlag(track.quality.lowConf);
  const flags = { dark, side, lowConf };
  return { ...flags, warnings: flagsToWarnings(flags) };
}

function snapshotFromTrack(track) {
  return {
    id: track.id,
    box: track.box,
    age: track.ages.length ? average(track.ages) : 0,
    emotion: mostCommon(track.emotions) || "neutral",
    gender: readGender(track),
    quality: readQuality(track),
  };
}

export function genderFromDet(det) {
  const conf = det.genderProbability || 0;
  if (conf < GENDER_MIN_CONF) {
    return { label: "Indefinido", conf };
  }
  return {
    label: det.gender === "female" ? "Feminino" : "Masculino",
    conf,
  };
}

export class FaceTracker {
  constructor() {
    this.tracks = [];
    this.nextId = 1;
  }

  reset() {
    this.tracks = [];
    this.nextId = 1;
  }

  createTrack() {
    return {
      id: this.nextId++,
      ages: [],
      genderVotes: [],
      emotions: [],
      quality: { dark: [], side: [], lowConf: [] },
      box: null,
      missed: 0,
    };
  }

  updateTrack(track, det, box, source) {
    track.box = smoothBox(track.box, box, BOX_SMOOTH);
    track.missed = 0;
    pushWindow(track.ages, det.age, SAMPLE_WINDOW);
    pushWindow(track.genderVotes, { gender: det.gender, p: det.genderProbability }, SAMPLE_WINDOW);

    const [emotion, score] = topExpression(det.expressions);
    if (score >= EMOTION_MIN_SCORE) {
      pushWindow(track.emotions, emotion, 12);
    }

    const quality = assessQuality(det, source);
    pushWindow(track.quality.dark, quality.dark, QUALITY_WINDOW);
    pushWindow(track.quality.side, quality.side, QUALITY_WINDOW);
    pushWindow(track.quality.lowConf, quality.lowConf, QUALITY_WINDOW);

    return snapshotFromTrack(track);
  }

  match(detections, mapDet, source) {
    const unused = detections.map((det) => ({
      det,
      box: mapDet(det),
    }));
    const snapshots = [];
    const stillAlive = [];

    for (const track of this.tracks) {
      let best = -1;
      let bestIou = MATCH_IOU;
      unused.forEach((item, index) => {
        const iou = boxIou(track.box || item.box, item.box);
        if (iou > bestIou) {
          bestIou = iou;
          best = index;
        }
      });

      if (best >= 0) {
        const [matched] = unused.splice(best, 1);
        snapshots.push(this.updateTrack(track, matched.det, matched.box, source));
        stillAlive.push(track);
      } else {
        track.missed += 1;
        if (track.missed < MAX_MISSED && track.box) {
          stillAlive.push(track);
          snapshots.push(snapshotFromTrack(track));
        }
      }
    }

    for (const leftover of unused) {
      const track = this.createTrack();
      snapshots.push(this.updateTrack(track, leftover.det, leftover.box, source));
      stillAlive.push(track);
    }

    this.tracks = stillAlive;
    return snapshots;
  }
}
