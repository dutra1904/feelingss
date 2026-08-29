function ageRange(age) {
  if (!age) {
    return "—";
  }
  const rounded = Math.round(age);
  return `${Math.max(0, rounded - 2)}–${rounded + 2}`;
}

function emotionLabel(key, map) {
  return map[key] || key;
}

function confPct(conf) {
  if (!conf) {
    return "";
  }
  return `${Math.round(conf * 100)}%`;
}

export function resizeOverlay(canvas, frame) {
  const rect = frame.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height };
}

export function drawBoxes(ctx, snapshots, highlightIndex = null) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  snapshots.forEach((snapshot, index) => {
    const { x, y, width, height } = snapshot.box;
    const warned = Boolean(snapshot.quality?.warnings?.length);
    const active = highlightIndex === null || highlightIndex === index;
    const dimmed = highlightIndex !== null && highlightIndex !== index;

    ctx.lineWidth = active && highlightIndex !== null ? 3.5 : 2;
    ctx.globalAlpha = dimmed ? 0.28 : 1;
    ctx.strokeStyle = warned ? "rgba(255, 196, 72, 0.95)" : "rgba(198, 255, 77, 0.95)";
    ctx.shadowColor = dimmed ? "transparent" : warned ? "rgba(255, 196, 72, 0.35)" : "rgba(198, 255, 77, 0.28)";
    ctx.shadowBlur = dimmed ? 0 : highlightIndex === index ? 22 : 12;

    if (highlightIndex === index) {
      ctx.fillStyle = warned ? "rgba(255, 196, 72, 0.16)" : "rgba(198, 255, 77, 0.16)";
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 10);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, width, height);
      }
    }

    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 10);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, width, height);
    }
  });

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

export function createRenderers(emotionMap) {
  function cardHtml(snapshot, index) {
    const warned = snapshot.quality?.warnings || [];
    const ok = !warned.length;
    const pct = confPct(snapshot.gender.conf);
    return `
      <article class="face-card ${ok ? "is-ok" : "is-warn"}" data-index="${index}">
        <header>
          <span class="idx">${String(index + 1).padStart(2, "0")}</span>
          <strong>${emotionLabel(snapshot.emotion, emotionMap)}</strong>
        </header>
        <dl>
          <div><dt>Idade</dt><dd>${ageRange(snapshot.age)}</dd></div>
          <div><dt>Sexo</dt><dd>${snapshot.gender.label}${pct ? ` · ${pct}` : ""}</dd></div>
        </dl>
        <p class="signal">${ok ? "Leitura estável" : warned.join(" · ")}</p>
      </article>
    `;
  }

  function renderHud(hud, snapshots, highlightIndex = null) {
    const frameW = hud.clientWidth;
    const frameH = hud.clientHeight;
    hud.replaceChildren();

    snapshots.forEach((snapshot, index) => {
      const { x, y } = snapshot.box;
      const crowded = snapshots.length > 5;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.dataset.index = String(index);
      chip.className = `chip ${snapshot.quality?.warnings?.length ? "is-warn" : "is-ok"} ${crowded ? "is-badge" : ""} ${highlightIndex === index ? "is-active" : ""}`;
      chip.innerHTML = crowded
        ? `<span>${String(index + 1).padStart(2, "0")}</span>`
        : `<span>${emotionLabel(snapshot.emotion, emotionMap)}</span><span>${ageRange(snapshot.age)}</span>`;
      hud.append(chip);

      const chipW = Math.min(220, chip.offsetWidth || (crowded ? 36 : 140));
      const chipH = chip.offsetHeight || 28;
      const left = Math.min(Math.max(4, x), Math.max(4, frameW - chipW - 4));
      const top = Math.min(Math.max(4, y - (crowded ? 0 : chipH + 6)), Math.max(4, frameH - chipH - 4));
      chip.style.left = `${left}px`;
      chip.style.top = `${crowded ? Math.max(4, y) : top}px`;
    });
  }

  function renderReadout(root, snapshots) {
    if (!snapshots.length) {
      root.innerHTML = `
        <p class="empty">Nenhum rosto no quadro. Olhe para a câmera ou envie uma foto nítida, de frente e com boa luz.</p>
      `;
      return;
    }
    root.innerHTML = snapshots.map((snapshot, index) => cardHtml(snapshot, index)).join("");
  }

  function statusFromSnapshots(snapshots, suffix = "") {
    const warned = snapshots.find((item) => item.quality?.warnings?.length);
    if (!snapshots.length) {
      return `Nenhum rosto${suffix}`;
    }
    if (warned) {
      return `${snapshots.length} rosto(s) · ${warned.quality.warnings.join(", ")}${suffix}`;
    }
    return `${snapshots.length} rosto(s) · leitura ok${suffix}`;
  }

  return { renderHud, renderReadout, statusFromSnapshots };
}
