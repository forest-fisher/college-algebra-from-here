/* Formula Wheels 22.0-rc.4 — parent page startup controller.
 * Installed in pages containing Formula Wheels by tools/patch_pretext.py.
 * The first wheel starts on DOMContentLoaded; there is exactly one 3000 ms
 * head start before the second; each later launch is >= 250 ms after the
 * previous ACTUAL launch. No parent MathJax promise or speech readiness gate.
 */
(() => {
  'use strict';
  const HEAD_START_MS = 3000;
  const LATER_GAP_MS = 250;
  const SELECTOR = 'iframe[data-fw-rc1-src]';
  let started = false;
  const report = {version:'22.0-rc.4',policy:'first-then-3000-then-250',
    firstHeadStartMs:HEAD_START_MS, subsequentGapMs:LATER_GAP_MS,
    started:false, launchTimesMs:[], frameIds:[], completed:false};
  window.FW_RC1_SCHEDULE = report; // Diagnostic observation only.
  // A PreTeXt article may allocate a wider layout column than the visible
  // phone viewport. Scaling *inside* such an iframe still centers the math in
  // the oversized frame and clips its right edge. Restrict the iframe's actual
  // box BEFORE loading the child, so its viewport and the painted equation
  // are both measured against the space actually visible on the phone.
  // Preserve authored iframe sizes on desktop and when they already fit.
  const originalFrameStyles = new WeakMap();
  function constrainMobileFrames(frames) {
    const viewport=Math.min(window.innerWidth,
      document.documentElement?.clientWidth || window.innerWidth);
    for (const frame of frames) {
      if (!frame.style || !frame.getBoundingClientRect) continue;
      if (!originalFrameStyles.has(frame)) {
        originalFrameStyles.set(frame, ['max-width','min-width'].map(name => [
          name,frame.style.getPropertyValue(name),frame.style.getPropertyPriority(name)
        ]));
      }
      if (viewport>600) {
        for (const [name,value,priority] of originalFrameStyles.get(frame)) {
          if (value) frame.style.setProperty(name,value,priority);
          else frame.style.removeProperty(name);
        }
        continue;
      }
      const left=frame.getBoundingClientRect().left;
      const visibleWidth=Math.max(80,Math.floor(viewport-Math.max(0,left)-8));
      frame.style.setProperty('min-width','0px','important');
      frame.style.setProperty('max-width',`${visibleWidth}px`,'important');
    }
  }
  function start() {
    if (started) return;
    started = true;
    const frames = [...document.querySelectorAll(SELECTOR)];
    constrainMobileFrames(frames);
    window.addEventListener?.('resize',() => constrainMobileFrames(frames),{passive:true});
    report.started = true;
    report.frameCount = frames.length;
    if (!frames.length) return;
    function launch(index) {
      const frame = frames[index];
      if (!frame) { report.completed = true; return; }
      const url = frame.getAttribute('data-fw-rc1-src');
      if (!url || frame.getAttribute('src') !== 'about:blank') {
        // Never overwrite a frame another script may have navigated.
        console.error('Formula Wheels scheduler: unexpected iframe state', index, frame);
        report.error = 'Unexpected source state at index '+index;
        return;
      }
      frame.setAttribute('loading', 'eager');
      frame.setAttribute('src', url);
      report.launchTimesMs.push(performance.now());
      report.frameIds.push(frame.id || '');
      if (index + 1 < frames.length) {
        setTimeout(() => launch(index + 1), index === 0 ? HEAD_START_MS : LATER_GAP_MS);
      } else {
        report.completed = true; // All navigations started, not all wheels mounted.
      }
    }
    launch(0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
