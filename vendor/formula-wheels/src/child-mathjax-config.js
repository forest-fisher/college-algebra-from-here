/* Formula Wheels 22.0-rc.1 — MathJax 4 per-iframe configuration.
 * MUST execute at the beginning of the generated iframe document's <head>,
 * before PreTeXt's MathJax configuration/startup. Do not add to the parent.
 * Proven technique from v1.0.9 with child enrichment ON, speech/Braille OFF.
 */
(() => {
  'use strict';
  const wanted = {enrich:true, speech:false, braille:false};
  let current = window.MathJax;
  const observation = {version:'22.0-rc.1', requested:wanted, assignments:0,
    applied:0, status:'pending', effective:null, error:null};
  window.FW_RC1_CHILD_ACCESSIBILITY = observation;
  function configure(mj) {
    if (!mj || typeof mj !== 'object' || mj.version || mj.startup?.document) return;
    try {
      const settings = ((mj.options ||= {}).menuOptions ||= {}).settings ||= {};
      Object.assign(settings, wanted);
      observation.applied++;
    } catch (error) {
      observation.error = 'Config injection: '+String(error);
      console.error('Formula Wheels MathJax configuration failed', error);
    }
  }
  try {
    Object.defineProperty(window,'MathJax', {
      configurable:true, enumerable:true,
      get() { return current; },
      set(value) { observation.assignments++; current = value; configure(current); }
    });
    if (!current) current = {};
    configure(current);
  } catch(error) {
    observation.error = 'Early configuration guard: '+String(error);
    console.error('Formula Wheels MathJax configuration failed',error);
    return;
  }
  // The guard is temporary: restore the ordinary window property after the
  // child MathJax document has initialized. No dependency on the parent gate.
  const started = performance.now();
  const check = () => {
    const mj = current;
    const doc = mj?.startup?.document;
    if (doc && mj?.version) {
      const opts = doc.options || {};
      const settings = opts.menuOptions?.settings || {};
      observation.effective = {
        enableEnrichment:opts.enableEnrichment, enableSpeech:opts.enableSpeech,
        enableBraille:opts.enableBraille, menuEnrich:settings.enrich,
        menuSpeech:settings.speech, menuBraille:settings.braille,
        renderer:doc.outputJax?.name || null, version:mj.version
      };
      const v = observation.effective;
      observation.status = (
        v.enableEnrichment === true && v.enableSpeech === false &&
        v.enableBraille === false && v.menuEnrich === true &&
        v.menuSpeech === false && v.menuBraille === false &&
        v.renderer === 'CHTML'
      ) ? 'PASS' : 'MISMATCH';
      Object.defineProperty(window,'MathJax', {
        configurable:true,enumerable:true,writable:true,value:mj
      });
      if (observation.status !== 'PASS') console.error('Formula Wheels child MathJax settings mismatch',observation);
      return;
    }
    // If loading fails, leave the early guard installed, rather than silently
    // replacing an unconfigured MathJax instance. Failure is console-visible.
    if (performance.now() - started > 30000) {
      observation.status = 'TIMEOUT';
      observation.error = 'MathJax document absent 30 seconds after iframe boot';
      console.error('Formula Wheels child MathJax startup timed out',observation);
      return;
    }
    setTimeout(check,50);
  };
  setTimeout(check,0);
})();
