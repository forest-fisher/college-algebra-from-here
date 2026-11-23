(() => {
  'use strict';
  const container=document.getElementById('formula-wheels');
  if (!container) return;
  const status=document.createElement('div');
  status.className='fw-beta1-status';
  status.setAttribute('role','status');
  container.after(status);
  const number=n=>({id:String(n),latex:String(n),value:n,speech:String(n)});
  const xValues=[-4,-3,-2,-1,0,1,2,3,4].map(number);
  function yFor(x) {
    const n=x.value+2;
    const latex=n===0 ? '0' : n===5 ? '1' :
      n<0 ? `-\\frac{${-n}}{5}` : `\\frac{${n}}{5}`;
    const speech=n===0 ? 'zero' : n===5 ? 'one' :
      `${n<0?'negative ':''}${Math.abs(n)===1 ? 'one fifth' : Math.abs(n)+' fifths'}`;
    return {id:'out-'+x.id,latex,value:n/5,speech};
  }
  const yValues=xValues.map(yFor);
  const outputs=new Map(xValues.map((x,i)=>[x.id,yValues[i]]));
  const inputs=new Map(yValues.map((y,i)=>[y.id,xValues[i]]));
  const configuration={
    variables:{
      x:{values:xValues,initial:'0',valueOrder:'ascending',pixelsPerStep:75,showChangeIndicator:true},
      y:{values:yValues,initial:'out-0',valueOrder:'ascending',pixelsPerStep:75,showChangeIndicator:true}
    },
    permissibleOutputs(changedVariable,selected){
      if(changedVariable==='x') return [outputs.get(selected.id)].filter(Boolean);
      if(changedVariable==='y') return [inputs.get(selected.id)].filter(Boolean);
      return [];
    },
    description:'The quantity x plus two, divided by five, equals y.'
  };
  const accessibleMathLatex=String.raw`\frac{x+2}{5}=y`;
  const preloadLatex=['+2','5','='];
  const formula=({slot,staticMath,shieldMath})=>
    `<span class="interactive-fraction">`+
    `<span class="fraction-numerator">${slot('x')}${staticMath('+2')}</span>`+
    `<span class="fraction-bar" aria-hidden="true"></span>`+
    `<span class="fraction-denominator">${shieldMath('5')}</span></span>`+
    `<span class="equal">${staticMath('=')}</span><span class="term">${slot('y')}</span>`;

  (async()=>{
    try {
      status.textContent='Preparing MathJax…';
      const instance=await window.createFormulaWheelsAsync({
        container, configuration, formula, accessibleMathLatex,
        preloadLatex, presentation:{showVariableTabs:true,showChangeIndicators:true}
      });
      window.FW_BETA1_INSTANCE=instance;
      const report=window.FormulaWheelsMath.status();
      status.textContent='READY: '+report.mathJaxVersion+' '+report.renderer+'. Use arrow keys; Enter confirms.';
      document.documentElement.dataset.beta1Ready='true';
    } catch(error) {
      console.error('Formula Wheels beta.1 authoring example failed',error);
      status.textContent='ERROR: '+(error?.message||String(error));
      document.documentElement.dataset.beta1Ready='error';
    }
  })();
})();
