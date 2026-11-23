(() => {
  'use strict';
  const configuration={variables:{
    x:{type:'varying',latex:'2'}, y:{type:'varying',latex:'5'},
    m:{type:'fixed',latex:'2'}, b:{type:'fixed',latex:'1'}
  },description:'Display-only linear equality with varying and fixed color boxes.'};
  FWGallery.run({name:'display-only-linear',configuration,displayOnly:true,
    formula:({slot})=>`${slot('y')}<span class="equal">=</span>${slot('m')}${slot('x')}<span class="mathop">+</span>${slot('b')}`,
    accessibleMathLatex:String.raw`y=2x+1`,instructions:'No wheel interaction or popup.'});
})();
