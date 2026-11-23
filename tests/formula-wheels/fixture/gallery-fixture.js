(() => {
  'use strict';
  window.FWGallery = Object.freeze({
    number(value) { return {id:String(value),latex:String(value),value,speech:String(value)}; },
    async run({name,configuration,formula,accessibleMathLatex,preloadLatex=[],presentation={},displayOnly=false,exampleKey='custom',instructions=''}) {
      const container=document.getElementById('formula-wheels');
      if (!container) return;
      const status=document.createElement('div');
      status.className='fw-beta1-status';
      status.setAttribute('role','status');
      container.after(status);
      try {
        status.textContent='Preparing MathJax…';
        const instance=await window.createFormulaWheelsAsync({
          container,configuration,formula,accessibleMathLatex,preloadLatex,
          presentation,displayOnly,exampleKey
        });
        window.FW_GALLERY_INSTANCE=instance;
        window.FW_GALLERY_CONFIGURATION=configuration;
        const math=window.FormulaWheelsMath.status();
          status.textContent='READY: '+math.mathJaxVersion+' '+math.renderer+
          (displayOnly?' (view only)':' | Enter confirms')+
          (instructions?' | '+instructions:'');
        document.documentElement.dataset.beta1Ready='true';
      } catch(error) {
        console.error('CommonHTML extended gallery '+name+' failed',error);
        status.textContent='ERROR: '+(error?.message||String(error));
        document.documentElement.dataset.beta1Ready='error';
      }
    }
  });
})();
