const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const canvas = document.querySelector("#pet");
const ctx = canvas.getContext("2d");
let laugh;
const spriteNames = ["naiwa-idle", "naiwa-guard", "naiwa-punch",
  "naiwa-walk-left", "naiwa-walk-right-v2", "laugh-sheet",
  "peace-overhead-sheet", "peace-front-sheet", "think-sheet",
  "feidudu-walk-user", "feidudu-sit-sheet", "feidudu-sit-peace-sheet", "niulai-walk-user",
  "niulai-walk-sheet", "niulai-thumbs-up-sheet", "niulai-six-seven-sheet", "wiggle-sheet"];
const forms = {
  feidudu: {
    image: "feidudu-walk-user", height: 299,
    frames: [[38, 4, 197, 296], [318, 4, 202, 299],
      [613, 2, 195, 297], [909, 2, 203, 296]],
    sit: {
      image: "feidudu-sit-sheet", height: 300,
      frames: [[0, 0, 250, 300], [250, 0, 250, 300],
        [500, 0, 250, 300], [750, 0, 250, 300]],
    },
    "sit-peace": {
      image: "feidudu-sit-peace-sheet", height: 300,
      frames: [[0, 0, 250, 300], [250, 0, 250, 300],
        [500, 0, 250, 300], [750, 0, 250, 300], [1000, 0, 250, 300]],
    },
  },
  niulai: {
    image: "niulai-walk-user", height: 745,
    frames: [[0, 0, 527, 745], [527, 0, 528, 745],
      [1055, 0, 527, 745], [1582, 0, 528, 745]],
    idle: {
      image: "niulai-walk-sheet", height: 532,
      frames: [[287, 9, 274, 532]],
    },
  },
};
const formActions = {
  naiwa: ["laugh", "punch", "peace-overhead", "peace-front", "think", "wiggle"],
  feidudu: ["sit", "sit-peace"],
  niulai: ["thumbs-up", "six-seven"],
};
const punchFrameTime = 0.13;
const punchFrames = ["naiwa-idle", "naiwa-guard",
  "naiwa-punch", "naiwa-guard", "naiwa-guard",
  "naiwa-punch", "naiwa-guard", "naiwa-guard",
  "naiwa-punch", "naiwa-guard", "naiwa-guard",
  "naiwa-punch", "naiwa-guard", "naiwa-guard",
  "naiwa-punch", "naiwa-guard", "naiwa-guard",
  "naiwa-punch", "naiwa-guard", "naiwa-guard",
  "naiwa-punch", "naiwa-guard", "naiwa-guard",
  "naiwa-punch", "naiwa-guard", "naiwa-guard", "naiwa-idle"];
const actionFrames = {
  wiggle: {
    sheet: "wiggle-sheet", frameTime: 0.2,
    frames: [0, 1, 2, 1, 3, 1, 2, 1, 3, 1, 2, 1, 3, 1, 2, 1, 3, 1, 0],
  },
};
const niulaiActions = {
  "thumbs-up": {
    sheet: "niulai-thumbs-up-sheet", frameTime: 0.15,
    frames: [0, 1, 2, 3, 4, 5, 4, 5, 6, 7],
    xOffsets: [-8, -8, -8, -8, -9, -8, -8, -8],
  },
  "six-seven": {
    sheet: "niulai-six-seven-sheet", frameTime: 0.14,
    frames: [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 3, 4, 5, 6, 5, 1, 7],
    xOffsets: [-8, -7, -7, 0, -9, -7, -7, 1],
  },
};
const sitFrames = [0, 1, 2, 3, 2, 1, 0];
const sitEndTimes = [0.10, 0.23, 0.38, 1.45, 1.58, 1.72, 1.85];
const sitPeaceFrames = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0];
const sitPeaceEndTimes = [0.10, 0.23, 0.38, 0.52, 0.65, 0.78, 0.93,
  2.00, 2.14, 2.28, 2.42, 2.54, 2.68, 2.81, 2.94];
const poseActions = {
  "peace-overhead": {
    sheet: "peace-overhead-sheet",
    endTimes: [0.13, 0.27, 0.41, 0.55, 1.18, 1.32, 1.46, 1.60, 1.72],
  },
  "peace-front": {
    sheet: "peace-front-sheet",
    endTimes: [0.13, 0.29, 0.46, 1.15, 1.32, 1.48, 1.60],
  },
  think: {
    sheet: "think-sheet",
    endTimes: [0.16, 0.37, 0.60, 1.48, 1.70, 1.90, 2.05],
  },
};
const sprites = Object.fromEntries(spriteNames.map(name => {
  const image = new Image();
  const form = name.startsWith("feidudu-") ? "feidudu"
    : name.startsWith("niulai-") ? "niulai" : "naiwa";
  image.src = `/assets/pet/${form}/${name}.png`;
  return [name, image];
}));
let settings;
let position;
let workArea;
let pixelRatio = 1;
let dragging = false;
let dragStart;
let walking = false;
let walkStarted = 0;
let walkTarget = 0;
let nextWalkAt = 1.5;
let nextAction = 10 + Math.random() * 8;
let action = null;
let actionStarted = 0;
let actionUntil = 0;
let direction = -1;
let lastTick = 0;
let nearIcon = false;
let lastIconReaction = -100;
let icons = [];
let iconRefreshPending = false;
let saveTimer;
let movePending = false;
let moveQueued = false;
let movePromise = Promise.resolve();
let dragStartPromise = Promise.resolve();
let dragMovePromise = Promise.resolve();
let dragMovePending = false;
let dragEndPromise = Promise.resolve();
let dragFinishing = false;
let menuOpen = false;
const started = performance.now();
const nowSeconds = () => (performance.now() - started) / 1000;
const random = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function useLayout(layout) {
  position = { x: layout.x, y: layout.y, width: layout.width, height: layout.height };
  workArea = layout.workArea;
  pixelRatio = layout.width / (104 * settings.Scale);
  if (walking) {
    const min = workArea.x + 4 * pixelRatio;
    const max = Math.max(min, workArea.x + workArea.width - position.width - 4 * pixelRatio);
    walkTarget = clamp(walkTarget, min, max);
    direction = Math.sign(walkTarget - position.x) || direction;
  }
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => invoke("persist_settings").catch(showError), 250);
}

function flushMove() {
  if (movePending) { moveQueued = true; return movePromise; }
  movePending = true;
  movePromise = (async () => {
    try {
      do {
        moveQueued = false;
        const { x, y } = position;
        try { await invoke("move_pet", { x: Math.round(x), y: Math.round(y) }); }
        catch (error) { showError(error); }
      } while (moveQueued);
    } finally {
      movePending = false;
    }
  })();
  return movePromise;
}

function setPosition(x, y) {
  position.x = x;
  position.y = y;
  flushMove();
  saveSoon();
}

function stopWalking(time) {
  walking = false;
  nextWalkAt = time + random(1, 4);
}

function play(kind) {
  if (!formActions[settings.Form].includes(kind)) return;
  walking = false;
  action = kind;
  actionStarted = nowSeconds();
  actionUntil = actionStarted + (actionFrames[kind]
    ? actionFrames[kind].frames.length * actionFrames[kind].frameTime
    : niulaiActions[kind]
    ? niulaiActions[kind].frames.length * niulaiActions[kind].frameTime
    : kind === "sit" ? sitEndTimes.at(-1)
    : kind === "sit-peace" ? sitPeaceEndTimes.at(-1)
    : kind === "laugh"
    ? laugh.endTimes.at(-1) / 1000
    : poseActions[kind] ? poseActions[kind].endTimes.at(-1)
    : punchFrames.length * punchFrameTime);
  nextAction = actionUntil + random(8, 16);
}

function startWalking(time) {
  const min = workArea.x + 4 * pixelRatio;
  const max = workArea.x + workArea.width - position.width - 4 * pixelRatio;
  if (max <= min) return;
  direction = Math.random() < 0.5 ? -1 : 1;
  const distance = random(60, 170) * pixelRatio;
  walkTarget = clamp(position.x + direction * distance, min, max);
  if (Math.abs(walkTarget - position.x) < 25 * pixelRatio) {
    direction = -direction;
    walkTarget = clamp(position.x + direction * distance, min, max);
  }
  if (Math.abs(walkTarget - position.x) < pixelRatio) {
    nextWalkAt = time + 2;
    return;
  }
  walking = true;
  walkStarted = time;
}

function reactsToIcon(time) {
  const pad = 18 * pixelRatio;
  const near = icons.some(icon =>
    position.x - pad < icon.x + icon.width &&
    position.x + position.width + pad > icon.x &&
    position.y - pad < icon.y + icon.height &&
    position.y + position.height + pad > icon.y);
  if (!near) { nearIcon = false; return false; }
  if (nearIcon) return false;
  nearIcon = true;
  if (time - lastIconReaction < 10) return false;
  lastIconReaction = time;
  play(formActions[settings.Form][Math.random() < 0.5 ? 0 : 1]);
  return true;
}

async function refreshIcons() {
  if (iconRefreshPending) return;
  iconRefreshPending = true;
  try { icons = await invoke("desktop_icon_bounds"); }
  catch { icons = []; }
  finally { iconRefreshPending = false; }
}

function drawImage(image, source) {
  if (!image?.complete || !image.naturalWidth) return;
  const width = source?.width ?? image.naturalWidth;
  const height = source?.height ?? image.naturalHeight;
  const factor = Math.min(104 / width, 120 / height);
  const targetWidth = width * factor;
  const targetHeight = height * factor;
  if (source) {
    ctx.drawImage(image, source.x, source.y, width, height,
      (104 - targetWidth) / 2, (120 - targetHeight) / 2,
      targetWidth, targetHeight);
  } else {
    ctx.drawImage(image, (104 - targetWidth) / 2,
      (120 - targetHeight) / 2, targetWidth, targetHeight);
  }
}

function drawFormFrame(form, frame, variant) {
  const { image, frames, height } = forms[form][variant] || forms[form];
  const sprite = sprites[image];
  if (!sprite || !(sprite.naturalWidth || sprite.width)) return;
  const [x, y, width, sourceHeight] = frames[frame];
  const factor = 112 / height;
  ctx.drawImage(sprite, x, y, width, sourceHeight,
    (104 - width * factor) / 2, 118 - sourceHeight * factor,
    width * factor, sourceHeight * factor);
}

function drawNiulaiAction(kind, time) {
  const { sheet, frameTime, frames, xOffsets } = niulaiActions[kind];
  const image = sprites[sheet];
  if (!image?.naturalWidth) return;
  const step = Math.min(frames.length - 1,
    Math.floor((time - actionStarted) / frameTime));
  const frame = frames[step];
  const width = image.naturalWidth / 4;
  const height = image.naturalHeight / 2;
  const factor = 112 / height;
  ctx.drawImage(image, (frame % 4) * width, Math.floor(frame / 4) * height,
    width, height, (104 - width * factor) / 2 + xOffsets[frame], 118 - height * factor,
    width * factor, height * factor);
}

function render(sprite, time, frame = 0) {
  ctx.clearRect(0, 0, 104, 120);
  ctx.save();
  ctx.translate(52, 96);
  const facing = settings.Form === "niulai" && sprite === "walking"
    ? -direction : direction;
  if (sprite === "walking") {
    ctx.scale(facing > 0 ? -1 : 1, 1);
    if (settings.Form === "naiwa") {
      ctx.rotate((frame === 1 ? -1.5 : frame === 3 ? 1.5 : 0) * Math.PI / 180);
      ctx.translate(0, frame === 1 || frame === 3 ? -2 : 0);
    }
  } else if (sprite === "idle" || sprite === "sit" || sprite === "sit-peace") {
    ctx.scale(facing > 0 ? -1 : 1, 1);
  } else if (sprite === "punch") {
    ctx.scale(facing > 0 ? -1 : 1, 1);
  } else if ((actionFrames[sprite] || poseActions[sprite]) && settings.Form === "naiwa") {
    ctx.scale(facing > 0 ? -1 : 1, 1);
  } else if (settings.Form === "niulai") {
    ctx.scale(facing > 0 ? -1 : 1, 1);
  }
  ctx.translate(-52, -96);
  if (settings.Form === "niulai" && niulaiActions[sprite]) {
    drawNiulaiAction(sprite, time);
  } else if (settings.Form !== "naiwa") {
    if (settings.Form === "feidudu" && (sprite === "sit" || sprite === "sit-peace")) {
      const frames = sprite === "sit" ? sitFrames : sitPeaceFrames;
      const endTimes = sprite === "sit" ? sitEndTimes : sitPeaceEndTimes;
      const index = endTimes.findIndex(end => time - actionStarted < end);
      const pose = frames[index < 0 ? frames.length - 1 : index];
      drawFormFrame("feidudu", pose < 4 ? pose : pose - 3,
        pose < 4 ? "sit" : "sit-peace");
    } else {
      drawFormFrame(settings.Form, sprite === "walking" ? frame : 0,
        sprite !== "walking" ? "idle" : undefined);
    }
  } else if (sprite === "laugh") {
    const elapsed = (time - actionStarted) * 1000;
    const index = Math.max(0, laugh.endTimes.findIndex(end => elapsed < end));
    const actual = index === 0 && elapsed >= laugh.endTimes.at(-1)
      ? laugh.endTimes.length - 1 : index;
    drawImage(sprites["laugh-sheet"], {
      x: (actual % laugh.columns) * laugh.width,
      y: Math.floor(actual / laugh.columns) * laugh.height,
      width: laugh.width, height: laugh.height,
    });
  } else if (sprite === "punch") {
    const step = Math.min(punchFrames.length - 1,
      Math.floor((time - actionStarted) / punchFrameTime));
    drawImage(sprites[punchFrames[step]]);
  } else if (poseActions[sprite]) {
    const pose = poseActions[sprite];
    const elapsed = time - actionStarted;
    const index = pose.endTimes.findIndex(end => elapsed < end);
    const frame = index < 0 ? pose.endTimes.length - 1 : index;
    if (frame === 0 || frame === pose.endTimes.length - 1) {
      drawImage(sprites["naiwa-idle"]);
    } else {
      drawImage(sprites[pose.sheet], {
        x: (frame % 4) * 286,
        y: Math.floor(frame / 4) * 344,
        width: 286, height: 344,
      });
    }
  } else if (actionFrames[sprite]) {
    const { sheet, frameTime, frames } = actionFrames[sprite];
    const index = Math.min(frames.length - 1,
      Math.floor((time - actionStarted) / frameTime));
    drawImage(sprites[sheet], {
      x: frames[index] * 512, y: 0, width: 512, height: 615,
    });
  } else if (sprite === "walking") {
    drawImage(sprites[frame === 1 ? "naiwa-walk-left"
      : frame === 3 ? "naiwa-walk-right-v2" : "naiwa-idle"]);
  } else {
    drawImage(sprites["naiwa-idle"]);
  }
  ctx.restore();
}

function tick() {
  const time = nowSeconds();
  const elapsed = Math.min(time - lastTick, 0.1);
  lastTick = time;
  if (menuOpen) {
    render("idle", time);
    requestAnimationFrame(tick);
    return;
  }
  if (!dragging && !dragFinishing) {
    if (action && time >= actionUntil) {
      action = null;
      nextWalkAt = time + random(1, 3);
    }
    if (action) render(action, time);
    else if (settings.Paused) render("idle", time);
    else if (walking) {
      const remaining = walkTarget - position.x;
      const step = Math.sign(remaining) *
        Math.min(Math.abs(remaining), elapsed * 32 * pixelRatio);
      setPosition(position.x + step, position.y);
      const frameTime = settings.Form === "feidudu" ? 0.1
        : settings.Form === "niulai" ? 0.16 : 0.18;
      const frameStep = Math.floor((time - walkStarted) / frameTime);
      const frame = settings.Form === "niulai"
        ? Math.min(frameStep % 5, 3) : frameStep % 4;
      render("walking", time, frame);
      if (!reactsToIcon(time) && Math.abs(walkTarget - position.x) < pixelRatio / 2)
        stopWalking(time);
    } else {
      render("idle", time);
      if (time >= nextAction) {
        const actions = formActions[settings.Form];
        play(actions[Math.floor(Math.random() * actions.length)]);
      }
      else if (time >= nextWalkAt) startWalking(time);
    }
  }
  requestAnimationFrame(tick);
}

function showError(error) {
  window.alert(`奶蛙桌宠：${error}`);
}

canvas.addEventListener("pointerdown", event => {
  if (event.button !== 0 || dragging) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  dragging = true;
  walking = false;
  dragStart = { x: event.screenX, y: event.screenY };
  dragMovePromise = Promise.resolve();
  dragStartPromise = Promise.all([movePromise, dragEndPromise]).then(() => invoke("begin_drag"));
});

canvas.addEventListener("pointermove", event => {
  if (!dragging || dragMovePending) return;
  dragMovePending = true;
  dragMovePromise = dragStartPromise
    .then(() => invoke("drag_pet"))
    .catch(showError)
    .finally(() => { dragMovePending = false; });
});

function finishDrag(event) {
  if (!dragging) return;
  dragging = false;
  dragFinishing = true;
  const started = dragStartPromise;
  const moved = dragMovePromise;
  const clicked = event.type !== "pointercancel" && Math.abs(event.screenX - dragStart.x) +
    Math.abs(event.screenY - dragStart.y) < 6;
  const ending = (async () => {
    try {
      await started;
      await moved;
      if (!clicked) await invoke("drag_pet");
      await invoke("end_drag");
      useLayout(await invoke("get_layout"));
    } catch (error) {
      showError(error);
    } finally {
      if (dragEndPromise === ending) {
        dragFinishing = false;
        nearIcon = false;
        walking = false;
        nextWalkAt = nowSeconds() + 2;
        if (clicked && !dragging) play(formActions[settings.Form][0]);
      }
    }
  })();
  dragEndPromise = ending;
  return ending;
}
canvas.addEventListener("pointerup", finishDrag);
canvas.addEventListener("pointercancel", finishDrag);
canvas.addEventListener("contextmenu", async event => {
  event.preventDefault();
  menuOpen = true;
  walking = false;
  try {
    await movePromise;
    await dragEndPromise;
    await invoke("popup_menu");
  } catch (error) {
    showError(error);
  } finally {
    menuOpen = false;
    nextWalkAt = nowSeconds() + 2;
    try { useLayout(await invoke("get_layout")); }
    catch (error) { showError(error); }
  }
});

async function main() {
  laugh = await fetch("/assets/pet/naiwa/laugh-frames.json").then(response => response.json());
  const [loaded, initialLayout] = await invoke("initialize");
  settings = loaded;
  useLayout(initialLayout);
  await listen("pet-action", event => play(event.payload));
  await listen("pause-changed", event => {
    settings.Paused = event.payload;
    if (settings.Paused) { walking = false; action = null; }
    else nextWalkAt = nowSeconds() + 1;
  });
  await listen("scale-changed", event => {
    settings.Scale = event.payload[0];
    useLayout(event.payload[1]);
  });
  await listen("form-changed", event => {
    settings.Form = event.payload;
    walking = false;
    action = null;
    nextWalkAt = nowSeconds() + 0.5;
  });
  await listen("pet-error", event => showError(event.payload));
  window.addEventListener("resize", async () => {
    useLayout(await invoke("get_layout"));
  });
  await invoke("persist_settings");
  refreshIcons();
  setInterval(refreshIcons, 5000);
  setInterval(async () => {
    if (!dragging && !dragFinishing && !walking && !movePending && !menuOpen) {
      try { useLayout(await invoke("get_layout")); }
      catch (error) { showError(error); }
    }
  }, 5000);
  requestAnimationFrame(tick);
}

main().catch(showError);
