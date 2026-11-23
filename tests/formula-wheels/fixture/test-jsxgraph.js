/* One author-defined example for both standalone HTML and PreTeXt.
   Neither the wheel engine nor the demonstration catalogue is imported. */
(() => {
  'use strict';
  const host = document.getElementById('formula-wheels');
  if (!host) return;
  const status = document.createElement('pre');
  status.id = 'fw-alpha2-status';
  status.setAttribute('aria-live','polite');
  status.style.cssText='font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap;color:#355367;max-width:100%;padding:8px;';
  host.after(status);
  const say = text => {status.textContent=text; console.info('[FW alpha.2]',text);};
  const number = n => ({id:String(n), latex:String(n), value:n, speech:String(n)});
  const values = [-2,-1,0,1,2].map(number);
  const configuration = {
    variables: {
      x: {values,initial:'0',pixelsPerStep:65,valueOrder:'ascending',showChangeIndicator:true},
      y: {strictlyDependent:true,valueOrder:'ascending',showChangeIndicator:true},
      m: {fixed:2}, b: {fixed:1}
    },
    permissibleOutputs(changedVariable,selected) {
      if (changedVariable !== 'x') return [];
      return [number(2*selected.value+1)];
    },
    description:'Explore how y changes as x changes in y equals two x plus one.'
  };
  const accessibleMathLatex = String.raw`y=2x+1`;
  const formula = ({slot}) => `<span class="term">${slot('y')}</span>`+
    `<span class="equal">=</span><span class="term coefficient-product">`+
    `${slot('m')}${slot('x')}</span><span class="mathop">+</span>${slot('b')}`;
  function linkGraph(instance) {
    const graphHost = document.getElementById('example-board');
    if (!graphHost) return;
    if (!window.JXG?.JSXGraph?.initBoard) {
      // Standalone smoke tests can still inspect the subscription state.
      graphHost.textContent='JSXGraph unavailable; wheel remains functional.';
      return;
    }
    const board = JXG.JSXGraph.initBoard(graphHost.id, {
      boundingbox:[-3.5,7,3.5,-6],axis:true,showNavigation:false,showCopyright:false
    });
    const dot = board.create('point',[0,1],{
      name:'', fixed:true, size:4, strokeColor:'#006F6D', fillColor:'#006F6D'
    });
    const stop = instance.subscribe(snapshot => {
      const x=snapshot.values.x?.[0]?.value;
      const y=snapshot.values.y?.[0]?.value;
      if (Number.isFinite(x) && Number.isFinite(y)) dot.moveTo([x,y]);
    });
    window.addEventListener('pagehide',()=>{stop();board.removeObject(dot);},{once:true});
  }
  (async () => {
    try {
      say('Preparing MathJax CommonHTML…');
      const instance = await window.createFormulaWheelsAsync({
        container:host,configuration,formula,accessibleMathLatex,exampleKey:'custom',
        presentation:{showVariableTabs:true,showVariableNamesInText:true,showChangeIndicators:true}
      });
      window.FW_ALPHA2_INSTANCE = instance;
      const mathInfo = window.FormulaWheelsMath.status();
      window.FW_ALPHA2_SAFE_STATUS = mathInfo?.safeStatus;
      linkGraph(instance);
      say('READY: Formula Wheels mounted; MathJax '+mathInfo.mathJaxVersion+
        ', renderer '+mathInfo.renderer+', prewarmed '+(mathInfo.preparedExpressions??'legacy')+
        ' expressions. Move x with arrow keys; Enter confirms.');
    } catch(error) {
      console.error('Formula Wheels 22.0-alpha.2 initialization failed',error);
      say('ERROR: '+String(error?.message||error));
    }
  })();
})();
