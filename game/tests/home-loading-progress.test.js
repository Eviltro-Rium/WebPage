const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const progress = require('../../js/home-loading-progress.js');
const root = path.resolve(__dirname, '../..');

test('loading progress never moves backward when resources change stages', () => {
  const model = progress.create();
  for (let i=0;i<40;i++) model.step(0.76, 16);
  const before = model.value();
  for (let i=0;i<20;i++) assert.equal(model.step(0.18, 16), before);
  assert.ok(model.step(0.9, 16) > before);
});

test('camera/bar progress holds at resource target and reaches 100 only when complete', () => {
  const model = progress.create();
  for(let i=0;i<200;i++) model.step(0.76, 16);
  assert.equal(model.value(), 0.76);
  const next = model.step(1, 16);
  assert.ok(next > 0.76 && next < 1);
  for(let i=0;i<200;i++) model.step(1, 16);
  assert.equal(model.value(), 1);
});

test('progress is frame-rate independent and clamps tab-resume jumps', () => {
  const values = [30,60,120].map(fps => {
    const model = progress.create();
    for(let i=0;i<fps;i++) model.step(0.9, 1000/fps);
    return model.value();
  });
  assert.ok(Math.max(...values)-Math.min(...values) < 1e-12);
  const model = progress.create();
  assert.equal(model.step(1, 0), 0);
  assert.ok(model.step(1, 5000) < 0.5);
  assert.ok(model.step(2, 16) <= 1);
});

test('homepage bar and camera consume the same progress; subpages keep original timing', () => {
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const source = fs.readFileSync(path.join(root,'js/hill-background.js'),'utf8');
  assert.ok(html.indexOf('src="js/home-loading-progress.js') < html.indexOf('src="js/hill-background.js'));
  assert.match(source, /homeLoadingProgress = isHomePage && window.RiumHomeLoadingProgress/);
  assert.match(source, /cameraProgress = homeLoadingProgress \? displayedProgress : bootProgress/);
  assert.match(source, /updateHomeLoading\(displayedProgress, loadingLabel, loadingStage\)/);
  assert.match(source, /loadingBar.style.transition = "none"/);
  assert.match(source, /homeLoadingProgress.step\(released \? 1 : loadingProgress/);
  assert.match(source, /if \(cameraProgress >= 1\)/);
});
