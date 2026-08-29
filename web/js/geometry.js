export function fitRect(srcW, srcH, dstW, dstH, mode = "contain") {
  if (!srcW || !srcH || !dstW || !dstH) {
    return { scale: 1, ox: 0, oy: 0 };
  }

  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  let scale;
  let ox = 0;
  let oy = 0;

  if (mode === "cover") {
    if (srcRatio > dstRatio) {
      scale = dstH / srcH;
      ox = (dstW - srcW * scale) / 2;
    } else {
      scale = dstW / srcW;
      oy = (dstH - srcH * scale) / 2;
    }
  } else if (srcRatio > dstRatio) {
    scale = dstW / srcW;
    oy = (dstH - srcH * scale) / 2;
  } else {
    scale = dstH / srcH;
    ox = (dstW - srcW * scale) / 2;
  }

  return { scale, ox, oy };
}

export function mapBox(box, fit, dstW, mirror = false) {
  let x = fit.ox + box.x * fit.scale;
  const y = fit.oy + box.y * fit.scale;
  const width = box.width * fit.scale;
  const height = box.height * fit.scale;
  if (mirror) {
    x = dstW - x - width;
  }
  return { x, y, width, height };
}

export function boxIntersectionArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

export function boxIou(a, b) {
  const inter = boxIntersectionArea(a, b);
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

export function smoothBox(prev, next, amount) {
  if (!prev) {
    return { ...next };
  }
  return {
    x: prev.x + (next.x - prev.x) * amount,
    y: prev.y + (next.y - prev.y) * amount,
    width: prev.width + (next.width - prev.width) * amount,
    height: prev.height + (next.height - prev.height) * amount,
  };
}
