// Trusted authoring source: calculation and configuration only, no browser initialization.
const values = Array.from({length:61}, (_,i) => {
  const n = Number((-3 + i/10).toFixed(1));
  return {id:String(n),latex:String(n),value:n};
});
const configuration = {
  variables: {
    x:{values,initial:'0'},
    y:{values:values.map(v=>({...v})),initial:'0'}
  },
  choiceBehavior:'required',
  permissibleOutputs(changedVariable, selected) {
    if (changedVariable!=='x' && changedVariable!=='y') return [];
    const remainder=Number((9-selected.value**2).toFixed(2));
    if (remainder<0) return [];
    if (remainder===0) return [{id:'0',latex:'0',value:0}];
    const negative={id:`negative-${remainder}`,latex:`-\\sqrt{${remainder}}`,
      value:-Math.sqrt(remainder),branchKey:'negative'};
    const positive={id:`positive-${remainder}`,latex:`\\sqrt{${remainder}}`,
      value:Math.sqrt(remainder),branchKey:'positive'};
    return {options:[negative,positive],preferredId:positive.id};
  }
};
