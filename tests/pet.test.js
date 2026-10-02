import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const initialLayout = {
  x: 800, y: 400, width: 104, height: 120,
  workArea: { x: 0, y: 0, width: 1000, height: 800 },
};

async function createPet(invokeOverride) {
  const handlers = {};
  const listeners = {};
  const calls = [];
  const draws = [];
  const scales = [];
  const errors = [];
  let time = 0;
  const ctx = Object.fromEntries(
    ["clearRect", "save", "restore", "translate", "rotate", "scale"].map(name => [name, () => {}]),
  );
  ctx.drawImage = image => draws.push(image.src);
  ctx.scale = (x, y) => scales.push([x, y]);
  const canvas = {
    getContext: () => ctx,
    addEventListener: (name, handler) => { handlers[name] = handler; },
    setPointerCapture() {},
  };
  const context = vm.createContext({
    Image: class {
      set src(value) {
        this.path = value;
        const bytes = readFileSync(new URL(`../src${value}`, import.meta.url));
        this.naturalWidth = bytes.readUInt32BE(16);
        this.naturalHeight = bytes.readUInt32BE(20);
        this.complete = true;
      }
      get src() { return this.path; }
    },
    performance: { now: () => time },
    document: { querySelector: () => canvas },
    window: {
      __TAURI__: {
        core: { invoke: async (command, args) => {
          calls.push({ command, args });
          if (command === "initialize") return [{ Form: "naiwa", Scale: 1, Paused: false }, initialLayout];
          if (command === "get_layout") return initialLayout;
          if (command === "desktop_icon_bounds") return [];
          return invokeOverride?.(command, args);
        } },
        event: { listen: async (name, handler) => { listeners[name] = handler; } },
      },
      addEventListener: (name, handler) => { handlers[name] = handler; },
      alert: error => errors.push(error),
    },
    fetch: async path => ({ json: async () => JSON.parse(
      readFileSync(new URL(`../src${path}`, import.meta.url), "utf8"),
    ) }),
    requestAnimationFrame() {},
    setInterval() {},
    setTimeout() {},
    clearTimeout() {},
  });
  const run = code => vm.runInContext(code, context);
  await run(source);
  return {
    run, handlers, calls, draws, scales, errors,
    emit: (name, payload) => listeners[name]({ payload }),
    tick: () => { time += 16; run("tick()"); },
  };
}

const pointer = (x = 100, type = "pointerup") => ({
  button: 0, pointerId: 1, screenX: x, screenY: 100, type, preventDefault() {},
});
const settle = () => new Promise(resolve => setImmediate(resolve));

for (const action of ["peace-overhead", "peace-front", "think"]) {
  test(`${action} follows the facing direction throughout the animation`, async () => {
    const pet = await createPet();
    pet.emit("pet-action", action);
    for (const direction of [-1, 1]) {
      pet.run(`direction = ${direction}`);
      for (const time of [0.05, 0.8, pet.run("actionUntil - 0.02")]) {
        pet.scales.length = 0;
        pet.run(`render(action, ${time})`);
        assert.deepEqual(pet.scales, [[direction > 0 ? -1 : 1, 1]]);
        assert.equal(pet.draws.at(-1), `/assets/pet/naiwa/${time === 0.8 ? `${action}-sheet` : "naiwa-idle"}.png`);
      }
    }
  });
}

test("laugh keeps its original direction regardless of facing", async () => {
  const pet = await createPet();
  pet.emit("pet-action", "laugh");
  for (const direction of [-1, 1]) {
    pet.scales.length = 0;
    pet.run(`direction = ${direction}; render(action, 0.8)`);
    assert.deepEqual(pet.scales, []);
    assert.equal(pet.draws.at(-1), "/assets/pet/naiwa/laugh-sheet.png");
  }
});

for (const [form, action, sprite] of [
  ["naiwa", "laugh", "laugh-sheet"],
  ["feidudu", "sit", "feidudu-sit-sheet"],
  ["niulai", "thumbs-up", "niulai-thumbs-up-sheet"],
]) {
  test(`${form} click plays a supported animation`, async () => {
    const pet = await createPet();
    pet.emit("form-changed", form);
    pet.handlers.pointerdown(pointer());
    await pet.handlers.pointerup(pointer());
    pet.tick();
    assert.equal(pet.run("action"), action);
    assert.equal(pet.draws.at(-1), `/assets/pet/${form}/${sprite}.png`);
    assert.deepEqual(pet.errors, []);
  });
}

test("unsupported menu actions do not interrupt the current form", async () => {
  const pet = await createPet();
  for (const [form, unsupported] of [["feidudu", "punch"], ["niulai", "laugh"], ["naiwa", "sit"]]) {
    pet.emit("form-changed", form);
    pet.emit("pet-action", unsupported);
    assert.equal(pet.run("action"), null);
  }
});

test("icon reactions use the current form's animations", async () => {
  const pet = await createPet();
  for (const [form, allowed] of [
    ["naiwa", ["laugh", "punch"]], ["feidudu", ["sit", "sit-peace"]],
    ["niulai", ["thumbs-up", "six-seven"]],
  ]) {
    pet.emit("form-changed", form);
    pet.run("icons = [{...position}]; nearIcon = false; lastIconReaction = -100; reactsToIcon(1)");
    assert(allowed.includes(pet.run("action")));
  }
});

test("enlarging during a walk keeps the destination inside the work area", async () => {
  const pet = await createPet();
  pet.run("settings.Scale = 0.8; walking = true; walkTarget = 913; direction = 1; nextAction = 999");
  pet.emit("scale-changed", [1.2, { ...initialLayout, x: 870, width: 125, height: 144 }]);
  for (let i = 0; i < 100; i++) { pet.tick(); await settle(); }
  assert(pet.run("position.x + position.width <= workArea.x + workArea.width"));
  assert(pet.run("walkTarget + position.width <= workArea.x + workArea.width"));
});

test("a second drag waits for the first drag's cleanup", async () => {
  const begins = [];
  let nativeDragging = false;
  const pet = await createPet(command => {
    if (command === "begin_drag") {
      nativeDragging = true;
      return new Promise(resolve => begins.push(resolve));
    }
    if (command === "end_drag") nativeDragging = false;
  });
  pet.handlers.pointerdown(pointer());
  await settle();
  const firstEnd = pet.handlers.pointerup(pointer(120));
  pet.handlers.pointerdown(pointer(120));
  await settle();
  const overlappingBegins = begins.length;
  begins[0]();
  await firstEnd;
  await settle();
  begins[1]();
  await settle();
  const secondDragActive = nativeDragging;
  await pet.handlers.pointerup(pointer(140));
  assert.equal(overlappingBegins, 1);
  assert.equal(secondDragActive, true);
  assert.equal(nativeDragging, false);
  assert.deepEqual(pet.errors, []);
});

test("automatic actions stay suspended until drag cleanup finishes", async () => {
  let finishBegin;
  const pet = await createPet(command => command === "begin_drag"
    ? new Promise(resolve => { finishBegin = resolve; }) : undefined);
  pet.run("nextAction = 0");
  pet.handlers.pointerdown(pointer());
  await settle();
  const ending = pet.handlers.pointerup(pointer(120));
  pet.tick();
  const actionWhileEnding = pet.run("action");
  finishBegin();
  await ending;
  assert.equal(actionWhileEnding, null);
});
