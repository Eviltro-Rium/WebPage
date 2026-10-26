const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { partitionInstances, packVisibleInstances, waitForGpu } = require('../../js/hill-scene-runtime.js');
const root = path.resolve(__dirname, '../..');

function matrix(x, y, z, scale = 1) {
  return [scale, 0, 0, 0, 0, scale * 0.8, 0, 0, 0, 0, scale, 0, x, y, z, 1];
}

test('spatial batches retain every original plant transform byte for byte', async () => {
  const source = new Float32Array([
    ...matrix(-30, 2, -25), ...matrix(18, 1, -14, 1.4),
    ...matrix(-29, 2.5, -26, 0.8), ...matrix(25, 0, 20)
  ]);
  const original = source.slice();
  const tiles = await partitionInstances(source, { x: 0, y: 0.4, z: 0 }, 2, 12, async () => {});
  assert.equal(tiles.length, 3);
  const keys = array => Array.from({ length: array.length / 16 }, (_, i) => Array.from(array.slice(i * 16, i * 16 + 16)).join(','));
  assert.deepEqual(tiles.flatMap(tile => keys(tile.matrices)).sort(), keys(source).sort());
  assert.deepEqual(source, original);
  for (const tile of tiles) {
    for (let i = 0; i < tile.matrices.length; i += 16) {
      const m = tile.matrices.slice(i, i + 16), r = 2 * m[0];
      const center = [m[12], m[13] + 0.4 * m[5], m[14]];
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(tile.min[axis] <= center[axis] - r + 1e-6);
        assert.ok(tile.max[axis] >= center[axis] + r - 1e-6);
      }
    }
  }
});

test('desktop-sized partitioning yields and preserves the full 68125-plant population', async () => {
  const count = 68125, matrices = new Float32Array(count * 16);
  for (let i = 0; i < count; i++) matrices.set(matrix(i % 200 - 100, 0, Math.floor(i / 200) - 170), i * 16);
  let yields = 0;
  const tiles = await partitionInstances(matrices, { x: 0, y: 0, z: 0 }, 1, 12, async () => { yields++; });
  assert.equal(tiles.reduce((sum, tile) => sum + tile.matrices.length / 16, 0), count);
  assert.ok(yields >= Math.floor(count / 2048));
  assert.ok(tiles.length > 1);
});

test('rotated non-uniformly scaled plants remain inside conservative wind bounds', async () => {
  const source = new Float32Array([0, 0, -3, 0, 0, 2, 0, 0, 1, 0, 0, 0, 4, 5, 6, 1]);
  const [tile] = await partitionInstances(source, { x: 1, y: 2, z: 3 }, 2, 12, async () => {});
  assert.deepEqual(tile.min, [1, 3, -3]);
  assert.deepEqual(tile.max, [13, 15, 9]);
});

test('GPU warm-up uses a nonblocking fence and always releases it', async () => {
  const fence = {}, calls = [];
  let polls = 0;
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 1, TIMEOUT_EXPIRED: 2,
    fenceSync: () => fence,
    flush: () => calls.push('flush'),
    clientWaitSync: (handle, flags, timeout) => {
      assert.equal(handle, fence); assert.equal(timeout, 0);
      return polls++ ? 3 : 2;
    },
    deleteSync: handle => { assert.equal(handle, fence); calls.push('delete'); }
  };
  await waitForGpu(gl);
  assert.deepEqual(calls, ['flush', 'delete']);
  assert.equal(polls, 2);
});

test('visible tiles pack into the original draw buffer without losing or changing plant matrices', () => {
  const a = new Float32Array(matrix(-15, 2, 10));
  const b = new Float32Array(matrix(20, 3, -15));
  const target = new Float32Array(32);
  const tiles = [{ visible: false, matrices: a }, { visible: true, matrices: b }];
  assert.equal(packVisibleInstances(target, tiles), 1);
  assert.deepEqual(target.slice(0, 16), b);
  tiles[0].visible = true;
  assert.equal(packVisibleInstances(target, tiles), 2);
  assert.deepEqual(target, new Float32Array([...a, ...b]));
  tiles.forEach(tile => { tile.visible = false; });
  assert.equal(packVisibleInstances(target, tiles), 0);
});

test('all hill pages load the runtime before the scene and homepage does not gate on the gallery', () => {
  for (const file of ['index.html', 'projects.html', 'materials.html', 'guestbook.html', 'launchpad.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(html.indexOf('src="js/hill-scene-runtime.js') < html.indexOf('src="js/hill-background.js'), file);
  }
  const source = fs.readFileSync(path.join(root, 'js/hill-background.js'), 'utf8');
  assert.ok(source.indexOf('renderer.compile(scene, camera)') < source.indexOf('requestAnimationFrame(animate)'));
  assert.equal(source.includes('window.__riumGalleryReady === true'), false);
});
