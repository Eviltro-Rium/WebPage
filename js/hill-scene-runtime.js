/* Scheduling and spatial batching; plant matrices and visual quality are preserved. */
(function (root) {
  function yieldTask() {
    if (root.scheduler && typeof root.scheduler.yield === 'function') return root.scheduler.yield();
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  async function partitionInstances(array, center, radius, tileSize, pause) {
    var bins = new Map();
    var size = tileSize || 12;
    var yieldWork = pause || yieldTask;
    var i, offset, matrix, x, y, z, scale, r, key, bin;
    for (i = 0; i < array.length / 16; i++) {
      offset = i * 16;
      matrix = array.subarray(offset, offset + 16);
      key = Math.floor(matrix[12] / size) + ':' + Math.floor(matrix[14] / size);
      bin = bins.get(key);
      if (!bin) {
        bin = { indices: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        bins.set(key, bin);
      }
      bin.indices.push(i);
      x = matrix[0] * center.x + matrix[4] * center.y + matrix[8] * center.z + matrix[12];
      y = matrix[1] * center.x + matrix[5] * center.y + matrix[9] * center.z + matrix[13];
      z = matrix[2] * center.x + matrix[6] * center.y + matrix[10] * center.z + matrix[14];
      scale = Math.sqrt(Math.max(
        matrix[0] * matrix[0] + matrix[1] * matrix[1] + matrix[2] * matrix[2],
        matrix[4] * matrix[4] + matrix[5] * matrix[5] + matrix[6] * matrix[6],
        matrix[8] * matrix[8] + matrix[9] * matrix[9] + matrix[10] * matrix[10]
      ));
      // The caller includes shader wind displacement in the local radius.
      r = radius * scale;
      bin.min[0] = Math.min(bin.min[0], x - r); bin.max[0] = Math.max(bin.max[0], x + r);
      bin.min[1] = Math.min(bin.min[1], y - r); bin.max[1] = Math.max(bin.max[1], y + r);
      bin.min[2] = Math.min(bin.min[2], z - r); bin.max[2] = Math.max(bin.max[2], z + r);
      if ((i + 1) % 2048 === 0) await yieldWork();
    }
    var result = [], index = 0;
    for (var entry of bins.values()) {
      var matrices = new Float32Array(entry.indices.length * 16);
      entry.indices.forEach(function (sourceIndex, targetIndex) {
        matrices.set(array.subarray(sourceIndex * 16, sourceIndex * 16 + 16), targetIndex * 16);
      });
      result.push({ matrices: matrices, min: entry.min, max: entry.max });
      if (++index % 8 === 0) await yieldWork();
    }
    return result;
  }

  async function waitForGpu(gl) {
    // WebGL2 fences yield to the page instead of blocking with gl.finish().
    if (!gl || typeof gl.fenceSync !== 'function') { await yieldTask(); return; }
    var fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!fence) return;
    try {
      gl.flush();
      var start = Date.now();
      while (Date.now() - start < 1500) {
        var status = gl.clientWaitSync(fence, 0, 0);
        if (status !== gl.TIMEOUT_EXPIRED) break;
        await yieldTask();
      }
    } finally { gl.deleteSync(fence); }
  }

  function packVisibleInstances(target, tiles) {
    var offset = 0;
    tiles.forEach(function (tile) {
      if (!tile.visible) return;
      target.set(tile.matrices, offset);
      offset += tile.matrices.length;
    });
    return offset / 16;
  }

  var api = { yieldTask: yieldTask, partitionInstances: partitionInstances, packVisibleInstances: packVisibleInstances, waitForGpu: waitForGpu };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiumHillRuntime = api;
})(typeof window === 'object' ? window : this);
