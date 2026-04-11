const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getHostPaddingPx,
  getVisualAnchor,
  getWindowOriginForContactPoint,
  normalizeTrackOffset,
  resolveTrackPosition
} = require("../dist/shared/snail-pet-geometry.js");

const bounds = {
  x: 100,
  y: 200,
  width: 300,
  height: 150
};

test("normalizeTrackOffset wraps negative and overflow offsets", () => {
  assert.equal(normalizeTrackOffset(-10, 900), 890);
  assert.equal(normalizeTrackOffset(910, 900), 10);
});

test("resolveTrackPosition maps perimeter offsets to the expected contact points", () => {
  assert.deepEqual(resolveTrackPosition(0, bounds), {
    offset: 0,
    edge: "top",
    contactX: 100,
    contactY: 200,
    progressOnEdge: 0,
    edgeLength: 300
  });
  assert.deepEqual(resolveTrackPosition(300, bounds), {
    offset: 300,
    edge: "right",
    contactX: 400,
    contactY: 200,
    progressOnEdge: 0,
    edgeLength: 150
  });
  assert.deepEqual(resolveTrackPosition(375, bounds), {
    offset: 375,
    edge: "right",
    contactX: 400,
    contactY: 275,
    progressOnEdge: 75,
    edgeLength: 150
  });
  assert.deepEqual(resolveTrackPosition(450, bounds), {
    offset: 450,
    edge: "bottom",
    contactX: 400,
    contactY: 350,
    progressOnEdge: 0,
    edgeLength: 300
  });
  assert.deepEqual(resolveTrackPosition(600, bounds), {
    offset: 600,
    edge: "bottom",
    contactX: 250,
    contactY: 350,
    progressOnEdge: 150,
    edgeLength: 300
  });
  assert.deepEqual(resolveTrackPosition(750, bounds), {
    offset: 750,
    edge: "left",
    contactX: 100,
    contactY: 350,
    progressOnEdge: 0,
    edgeLength: 150
  });
  assert.deepEqual(resolveTrackPosition(825, bounds), {
    offset: 825,
    edge: "left",
    contactX: 100,
    contactY: 275,
    progressOnEdge: 75,
    edgeLength: 150
  });
  assert.deepEqual(resolveTrackPosition(900, bounds), {
    offset: 0,
    edge: "top",
    contactX: 100,
    contactY: 200,
    progressOnEdge: 0,
    edgeLength: 300
  });
});

test("getVisualAnchor returns stable anchors for every edge and direction", () => {
  const padding = getHostPaddingPx(3);
  const expectedAnchors = {
    top: {
      "-1": { x: 54, y: 27 },
      "1": { x: 66, y: 27 }
    },
    right: {
      "-1": { x: 93, y: 54 },
      "1": { x: 93, y: 66 }
    },
    bottom: {
      "-1": { x: 66, y: 93 },
      "1": { x: 54, y: 93 }
    },
    left: {
      "-1": { x: 27, y: 66 },
      "1": { x: 27, y: 54 }
    }
  };

  for (const edge of ["top", "right", "bottom", "left"]) {
    assert.deepEqual(getVisualAnchor(edge, -1, 3, padding), expectedAnchors[edge]["-1"]);
    assert.deepEqual(getVisualAnchor(edge, 1, 3, padding), expectedAnchors[edge]["1"]);
  }
});

test("window origin plus anchor reproduces the contact point on every side", () => {
  const padding = getHostPaddingPx(3);
  const scenarios = [
    { edge: "top", direction: 1, contact: { x: 250, y: 200 } },
    { edge: "right", direction: 1, contact: { x: 400, y: 275 } },
    { edge: "bottom", direction: -1, contact: { x: 250, y: 350 } },
    { edge: "left", direction: -1, contact: { x: 100, y: 275 } }
  ];

  for (const scenario of scenarios) {
    const anchor = getVisualAnchor(scenario.edge, scenario.direction, 3, padding);
    const origin = getWindowOriginForContactPoint(scenario.contact, anchor);
    assert.equal(origin.x + anchor.x, scenario.contact.x);
    assert.equal(origin.y + anchor.y, scenario.contact.y);
  }
});
