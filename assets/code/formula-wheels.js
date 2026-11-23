/* Formula Wheels 22.0-alpha.2: extracted from approved v21.7.3.
   Reusable wheel factory, no demo configuration or visualization dependencies.
   Browser global API retained for PreTeXt platform=javascript. */
(() => {
'use strict';
  // Legacy debug API utility; independent of demonstration definitions.
  function numberEntry(n) { return {id:String(n), latex:String(n), value:n}; }
  let nextComponentPrefix = 0;
  // Document-level Escape belongs to the most recently *handled* input,
  // not merely the most recently started gesture. Several instances may have
  // unfinished scroll previews simultaneously. A focused instance takes
  // precedence only if it actually has an unfinished interaction.
  const activeInputOwners = new Map();
  const ownersByRoot = new WeakMap();
  // V21.3.1: a host may have only one live (interactive or display-only) instance.
  const mountedFormulaHosts = new WeakSet();
  let lastInteractionOwner = null;
  function claimInputOwner(owner) {
    activeInputOwners.delete(owner);
    activeInputOwners.set(owner, true); // Map insertion order = recency.
    lastInteractionOwner = owner;
  }
  function releaseInputOwner(owner) {
    activeInputOwners.delete(owner);
    lastInteractionOwner = Array.from(activeInputOwners.keys()).at(-1) ?? null;
  }
  function createFormulaWheels({container, configuration, formula=null,
      accessibleMathLatex=undefined, accessibleEquationLatex=undefined,
      accessibleMathLabel='Equation', exampleKey='custom', choiceMode=null,
      presentation={}, displayOnly=false} = {}) {
    if (!(container instanceof Element)) throw new TypeError('A container element is required');
    if (!configuration || !configuration.variables || typeof configuration.variables!=='object')
      throw new TypeError('A configuration with variables is required');
    if (typeof displayOnly!=='boolean') throw new TypeError('displayOnly must be boolean');
    // Formula Wheels names are neutral about whether the mathematics is an
    // equation, expression, or formula. Retain the old LaTeX property only
    // as an explicit compatibility alias; ambiguous calls fail before DOM work.
    if (accessibleMathLatex !== undefined && accessibleEquationLatex !== undefined)
      throw new TypeError('Use accessibleMathLatex or legacy accessibleEquationLatex, not both');
    const symbolicLatex = accessibleMathLatex !== undefined
      ? accessibleMathLatex : accessibleEquationLatex ?? null;
    if (symbolicLatex !== null &&
        (typeof symbolicLatex !== 'string' || !symbolicLatex.trim()))
      throw new TypeError(`${accessibleMathLatex !== undefined ? 'accessibleMathLatex' : 'accessibleEquationLatex'} must be a nonempty LaTeX string or null`);
    if (typeof accessibleMathLabel !== 'string' || !accessibleMathLabel.trim())
      throw new TypeError('accessibleMathLabel must be a nonempty string');
    // Authors may provide 'Expression' or 'Expression:'; announce one colon.
    const mathLabel = accessibleMathLabel.trim().replace(/:+$/, '').trim();
    if (!mathLabel) throw new TypeError('accessibleMathLabel must contain a label');
    if (!displayOnly && typeof configuration.permissibleOutputs!=='function')
      throw new TypeError('Interactive formulas require permissibleOutputs()');
    // V20.6: strict dependence is an interaction role, not a mathematical
    // domain check. At most one of the two varying variables may be locked
    // as an output. Its canonical values array is optional and unused.
    // V21.7.3: validate optional speech before changing the host.
    function validateOptionalSpeech(entry, context) {
      if (entry.speech !== undefined &&
          (typeof entry.speech !== 'string' || !entry.speech.trim()))
        throw new TypeError(`${context}: speech must be a nonempty string when supplied`);
    }
    const configs=Object.entries(configuration.variables);
    const strictlyDependentNames=configs.filter(([,spec])=>spec.strictlyDependent===true).map(([name])=>name);
    for (const [name,spec] of configs) {
      if (spec.strictlyDependent !== undefined && typeof spec.strictlyDependent !== 'boolean')
        throw new TypeError(`strictlyDependent for ${name} must be boolean`);
      if (spec.strictlyDependent && Object.hasOwn(spec,'fixed'))
        throw new TypeError(`Fixed quantity ${name} cannot be strictly dependent`);
      // V21.6.2: concealment is available only for a declared dependent output.
      // Reject author errors before any host attributes or DOM are changed.
      if (spec.valueDisplay !== undefined && !['visible','hidden'].includes(spec.valueDisplay))
        throw new TypeError(`valueDisplay for ${name} must be "visible" or "hidden"`);
      // Placeholder text is literal, escaped by concealedValueMarkup().
      if (spec.hiddenValueLabel !== undefined && typeof spec.hiddenValueLabel !== 'string')
        throw new TypeError(`hiddenValueLabel for ${name} must be a string`);
      if (spec.boxDisplay !== undefined && !['visible','hidden'].includes(spec.boxDisplay))
        throw new TypeError(`boxDisplay for ${name} must be "visible" or "hidden"`);
      if (spec.boxDisplay === 'hidden' && spec.strictlyDependent !== true)
        throw new TypeError(`Cannot hide the box for ${name}: boxDisplay: "hidden" is supported only for strictly dependent quantities`);
      if (spec.boxDisplay === 'hidden' &&
          (spec.valueDisplay === 'hidden' || Object.hasOwn(spec,'hiddenValueLabel')))
        throw new TypeError(`Cannot combine boxDisplay: "hidden" with value concealment for ${name}; the entire box is omitted`);
      if ((spec.valueDisplay === 'hidden' || Object.hasOwn(spec,'hiddenValueLabel')) &&
          spec.strictlyDependent !== true)
        throw new TypeError(`Cannot conceal ${name}: valueDisplay: "hidden" and hiddenValueLabel are supported only for strictly dependent quantities`);
      if (Object.hasOwn(spec,'hiddenValueLabel') && spec.valueDisplay !== 'hidden')
        throw new TypeError(`hiddenValueLabel for ${name} requires valueDisplay: "hidden"`);
    }
    if (!displayOnly && strictlyDependentNames.length) {
      const varying=configs.filter(([,spec])=>
        Array.isArray(spec.values) || spec.strictlyDependent===true).map(([name])=>name);
      if (strictlyDependentNames.length!==1 || varying.length!==2)
        throw new TypeError('strictlyDependent requires exactly two varying quantities, only one strictly dependent');
      const input=varying.find(name=>name!==strictlyDependentNames[0]);
      if (!Array.isArray(configuration.variables[input].values) ||
          configuration.variables[input].values.length===0)
        throw new TypeError(`Input quantity ${input} requires a nonempty values array`);
    }
    // V21.2.1: validate the two-varying-quantity contract and canonical wheel
    // entries BEFORE creating nodes, assigning IDs, or changing host attributes.
    // Display-only figures identify varying quantities by their semantic type;
    // interactive wheels use selectable values or strict dependence.
    const varyingNames=configs.filter(([,spec]) => displayOnly
      ? spec.type==='varying' || spec.strictlyDependent===true
      : Array.isArray(spec.values) || spec.strictlyDependent===true).map(([name])=>name);
    if (varyingNames.length>2)
      throw new TypeError(`Formula Wheels supports at most two varying quantities; found ${varyingNames.length}: ${varyingNames.join(', ')}`);
    if (!displayOnly) {
      for (const [name,spec] of configs) {
        if (Object.hasOwn(spec,'values') && !Array.isArray(spec.values) && !spec.strictlyDependent)
          throw new TypeError(`Selectable values for ${name} must be an array`);
        if (spec.strictlyDependent) continue; // Its values/initial are optional and unused.
        if (!Array.isArray(spec.values)) continue; // Fixed quantity, not a wheel.
        if (spec.values.length===0)
          throw new TypeError(`Selectable values for ${name} must be a nonempty array`);
        const seen=new Set();
        for (const entry of spec.values) {
          if (!entry || typeof entry.id!=='string' ||
              typeof entry.latex!=='string' || !Number.isFinite(entry.value))
            throw new TypeError(`Selectable entries for ${name} require {id, latex, value} with a finite numeric value`);
          validateOptionalSpeech(entry, `Selectable entry ${entry.id} for ${name}`);
          if (seen.has(entry.id))
            throw new TypeError(`Duplicate selectable ID "${entry.id}" for ${name}`);
          seen.add(entry.id);
        }
        if (typeof spec.initial!=='string' || !seen.has(spec.initial))
          throw new TypeError(`Initial ID "${String(spec.initial)}" for ${name} is not in its selectable values`);
      }
    }
    // V21.5.1: interactive controls always model a pair of varying quantities.
    // Either both are manipulable or exactly one is strictly dependent.
    // A true single-quantity interaction is a separate future feature.
    if (!displayOnly && varyingNames.length!==2)
      throw new TypeError(`Interactive formulas require exactly two varying quantities (one or two manipulable); found ${varyingNames.length}`);
    const resolvedChoiceMode=choiceMode ?? configuration?.choiceBehavior ?? 'required';
    if (!displayOnly && !['required','automatic'].includes(resolvedChoiceMode))
      throw new TypeError('choiceMode must be "required" or "automatic"');

    // Reserve the host before its first DOM mutation, including during
    // synchronous author callbacks. If initialization fails, release the guard.
    if (mountedFormulaHosts.has(container))
      throw new Error('A Formula Wheels instance is already mounted in this container; destroy() it before mounting another');
    // V21.4.1: A failed mount restores the exact host nodes and attributes.
    // Reuse the original nodes (rather than clones) to preserve host listeners.
    const originalNodes = [];
    function rememberOriginalNode(node) {
      originalNodes.push({
        node,
        children: node.nodeType===Node.ELEMENT_NODE ? [...node.childNodes] : null,
        attributes: node.nodeType===Node.ELEMENT_NODE
          ? [...node.attributes].map(attr=>[attr.name,attr.value]) : null,
        data: node.nodeType===Node.TEXT_NODE || node.nodeType===Node.COMMENT_NODE
          ? node.data : null
      });
      for (const child of node.childNodes ?? []) rememberOriginalNode(child);
    }
    rememberOriginalNode(container);
    function restoreOriginalHost() {
      // Restore descendants before their parents so removed original nodes
      // can be reattached with their original children and event listeners.
      for (const {node,children,attributes,data} of originalNodes.reverse()) {
        if (data!==null) node.data=data;
        if (attributes!==null) {
          for (const attr of [...node.attributes]) node.removeAttribute(attr.name);
          for (const [name,value] of attributes) node.setAttribute(name,value);
        }
        if (children!==null) node.replaceChildren(...children);
      }
    }
    const failureDisposers=[];
    mountedFormulaHosts.add(container);
    try {
    const equationRoot = container;
    // Only undo the aria-label that this instance sets. If the author does not
    // supply a description, host-provided accessibility labels remain untouched.
    const originalHostAriaLabel=equationRoot.getAttribute('aria-label');
    const setsHostAriaLabel=configuration.description != null;
    function restoreHostAriaLabel() {
      if (!setsHostAriaLabel) return;
      if (originalHostAriaLabel===null) equationRoot.removeAttribute('aria-label');
      else equationRoot.setAttribute('aria-label',originalHostAriaLabel);
    }
    // A named group gives generic PreTeXt/demo hosts an accessible context.
    // Preserve explicit author roles and native landmark elements.
    const ownsGroupRole = !equationRoot.hasAttribute('role') &&
      equationRoot.tagName.toLowerCase()==='div';
    if (ownsGroupRole) equationRoot.setAttribute('role','group');
    // The demonstration is pre-namespaced by Version 20.0's page setup.
    // For a standalone author-created container, name its IDs on first mount.
    // This leaves the factory independent of the demo's global DOM helpers.
    if (!equationRoot.dataset.domPrefix) {
      const prefix=`eqw-instance-${++nextComponentPrefix}`;
      equationRoot.dataset.domPrefix=prefix;
      const renamed=new Map();
      for (const element of equationRoot.querySelectorAll('[id]')) {
        const old=element.id, fresh=`${prefix}-${old}`;
        renamed.set(old,fresh); element.id=fresh;
      }
      for (const element of [equationRoot,...equationRoot.querySelectorAll('[for], [aria-describedby], [aria-labelledby], [aria-controls], [aria-owns], [aria-activedescendant]')]) {
        for (const attr of ['for','aria-describedby','aria-labelledby','aria-controls','aria-owns','aria-activedescendant']) {
          if (!element.hasAttribute(attr)) continue;
          element.setAttribute(attr,element.getAttribute(attr).split(/\s+/).map(
            id=>renamed.get(id)||id).join(' '));
        }
      }
    }
    const eqId=name=>`${equationRoot.dataset.domPrefix}-${name}`;
    // Escape the full ID for CSS selectors: author variable names may contain quotes.
    const eqById=name=>equationRoot.querySelector(`#${CSS.escape(eqId(name))}`);
    // V21.5.2: Authors may supply only a container. Create the interactive
    // scaffold on demand; reuse existing controls and customized help verbatim.
    // These exact nodes are removed at destroy(), not author-owned siblings.
    const createdScaffoldNodes=[];
    const hadSlateAttribute=equationRoot.hasAttribute('data-slate');
    const hadPrefixAttribute=originalNodes[0].attributes.some(([name])=>name==='data-dom-prefix');
    const originallyEmpty=!originalNodes[0].children.some(node=>
      node.nodeType===Node.ELEMENT_NODE ||
      (node.nodeType===Node.TEXT_NODE && node.textContent.trim()));
    if (!displayOnly) {
      if (!hadSlateAttribute) equationRoot.dataset.slate='equation';
      function createScaffoldElement(parent, name, tag, className) {
        const element=document.createElement(tag);
        element.id=eqId(name);
        if (className) element.className=className;
        parent.append(element);
        createdScaffoldNodes.push(element);
        return element;
      }
      if (!eqById('wheel-keyboard-help')) {
        const help=createScaffoldElement(equationRoot,'wheel-keyboard-help','p','sr-only');
        help.textContent='Use Up and Down arrows to move one value, or Page Up and Page Down to move ten values. Press Home for the first value or End for the last value. Press Enter to confirm; Escape or Tab cancels.';
      }
      const face=eqById('equation') ||
        createScaffoldElement(equationRoot,'equation','div','equation');
      // Existing hosts already supply this class; newly created faces need it.
      // Their contents and attributes otherwise remain under author control.
      if (createdScaffoldNodes.includes(face)) face.setAttribute('aria-busy','true');
      const tray=eqById('choice-popup') ||
        createScaffoldElement(equationRoot,'choice-popup','div','choice-popup');
      if (createdScaffoldNodes.includes(tray)) {
        tray.hidden=true;
        tray.setAttribute('aria-live','polite');
      }
      if (!eqById('choice-label'))
        createScaffoldElement(tray,'choice-label','div','choice-label');
      if (!eqById('choice-buttons'))
        createScaffoldElement(tray,'choice-buttons','div','choice-buttons');
    }
    if (displayOnly) {
      // A static figure can be authored into a completely empty host: no
      // popup, help text, wheel HTML, or prebuilt equation scaffold required.
      equationRoot.dataset.slate='equation';
      let face=equationRoot.querySelector(':scope > .equation');
      if (!face) {
        face=document.createElement('div');
        face.className='equation';
        equationRoot.append(face);
      }
      face.id=eqId('equation');
    }
    const exercise=configuration;
    const {variables,permissibleOutputs}=exercise;
    const choiceBehavior=()=>resolvedChoiceMode;
    const presentationState={
      showVariableTabs:true,
      showVariableNamesInText:true,
      showChangeIndicators:true,
      equationScale:1,
      noOutputsLabel:'none',
      ...presentation
    };
    function validateEquationScale(scale) {
      if (typeof scale!=='number' || !Number.isFinite(scale) || scale<=0)
        throw new TypeError('presentation.equationScale must be a positive finite number');
      return scale;
    }
    validateEquationScale(presentationState.equationScale);
    function validateNoOutputsLabel(label) {
      if (typeof label!=='string')
        throw new TypeError('presentation.noOutputsLabel must be a string');
      return label;
    }
    validateNoOutputsLabel(presentationState.noOutputsLabel);
    // The 38px equation font remains the reference size. Scaling is applied
    // to the complete assembled formula, never to its individual font sizes.
    function responsiveBaselineScale() {
      // A PreTeXt iframe may be narrower than the parent phone viewport.
      // Choose one baseline for EVERY figure on that page, rather than
      // selecting a different breakpoint from each iframe's own width.
      // Standalone and cross-origin embeds fall back to their own viewport.
      let width=Math.min(window.innerWidth,
        document.documentElement?.clientWidth || window.innerWidth);
      try {
        if (window.parent && window.parent!==window) {
          // On mobile Chromium a wide PreTeXt column can inflate
          // parent.innerWidth beyond the phone's *visible* viewport.
          // documentElement.clientWidth retains the actual layout viewport.
          const parentWidth=window.parent.document.documentElement.clientWidth;
          if (Number.isFinite(parentWidth) && parentWidth>0) width=parentWidth;
        }
      } catch (_) { /* Cross-origin parent: iframe width is the fallback. */ }
      return width<=350?.52:width<=420?.55:width<=600?.76:1;
    }
    function fittedEquationScale(equation) {
      const target=responsiveBaselineScale()*presentationState.equationScale;
      const fit=Math.max(0.01,equationRoot.clientWidth-16)/Math.max(1,equation.offsetWidth);
      return Math.min(target,fit);
    }
    // A CSS transform changes the *painted* width, not the width used by flex
    // layout. Compensate equally on both sides so a scaled formula occupies
    // its painted width in the centered slate. This prevents the invisible
    // pre-transform footprint from producing mobile horizontal overflow,
    // without shrinking each formula individually or altering touch targets.
    function applyEquationScale(equation,scale) {
      const naturalWidth=equation.offsetWidth;
      const edgeMargin=(scale-1)*naturalWidth/2;
      equation.style.marginInlineStart=`${edgeMargin}px`;
      equation.style.marginInlineEnd=`${edgeMargin}px`;
      equation.style.transform=`scale(${scale})`;
    }
    function resetEquationScale(equation) {
      equation.style.transform='none';
      equation.style.removeProperty('margin-inline-start');
      equation.style.removeProperty('margin-inline-end');
    }
    const lifetime=new AbortController();
    failureDisposers.push(()=>lifetime.abort());
    let destroyed=false;
    // One-shot layout work is instance-owned, just like wheel/drag animation.
    // It must never run against a container after its instance is destroyed.
    const pendingLayoutFrames=new Set();
    function queueLayoutFrame(callback) {
      if (destroyed) return;
      const id=requestAnimationFrame(() => {
        pendingLayoutFrames.delete(id);
        if (!destroyed) callback();
      });
      pendingLayoutFrames.add(id);
      return id;
    }
    function cancelLayoutFrames() {
      for (const id of pendingLayoutFrames) cancelAnimationFrame(id);
      pendingLayoutFrames.clear();
    }
    failureDisposers.push(cancelLayoutFrames);
  // MathJax CommonHTML templates are cached by literal author LaTeX. A change of
  // numerical index only reuses cached math HTML; nothing is typeset in a drag loop.
  const texHTMLCache = new Map();
  let mathJaxConversions = 0;
  function texHTML(latex) {
    if (texHTMLCache.has(latex)) return texHTMLCache.get(latex);
    const node = FWMath.tex2node(latex, {display:false});
    node.removeAttribute('tabindex');
    node.removeAttribute('ctxtmenu_counter');
    // Fragment's interactive ancestor owns its own accessible description.
    const result = node.outerHTML;
    texHTMLCache.set(latex, result);
    mathJaxConversions++;
    return result;
  }
  const staticMath = latex => `<span class="math-fragment">${texHTML(latex)}</span>`;
  const shieldMath = latex => `<span class="math-shield">${staticMath(latex)}</span>`;


  // Per-instance V19.6 subscription state. The factory's subscriber set belongs
  // to this instance. The demonstration adapter outside the factory reconnects
  // its existing visualization when the dropdown selects a new exercise.
  // Returned snapshots are fresh plain-data copies.
  const valueSubscribers = new Set();
  let latestValueSnapshot = null;
  let latestSnapshotFingerprint = null;
  let snapshotRevision = 0;
  const copySnapshot = snapshot => snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
  function notifyValueSubscribers(payload) {
    const fingerprint = JSON.stringify(payload);
    if (fingerprint === latestSnapshotFingerprint) return;
    latestSnapshotFingerprint = fingerprint;
    latestValueSnapshot = {...payload, revision:++snapshotRevision};
    for (const listener of valueSubscribers) {
      try { listener(copySnapshot(latestValueSnapshot)); }
      catch (error) { console.error('formulaWheels subscriber failed',error); }
    }
  }



  // One type-aware slot() helper for author formulas, regardless of mode.
  // Interactive types are inferred from values/fixed; display-only types must
  // be explicit, because an empty box contains neither values nor a fixed value.
  // Every repeated occurrence receives a distinct DOM ID.
  const occurrenceCounts = Object.create(null);
  // IDs represent author-variable position and occurrence, never raw names.
  // A repeated x cannot collide with an unrelated variable named x-2.
  const slotKeys = new Map(configs.map(([name], index) => [name, `slot-${index}`]));
  const slotKey = (name, occurrence=1) => `${slotKeys.get(name)}-${occurrence}`;
  const escapeAttribute = value => String(value).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const boxOmitted = name => variables[name].strictlyDependent===true &&
    variables[name].boxDisplay==='hidden';
  const valueConcealed = name => variables[name].strictlyDependent===true &&
    variables[name].valueDisplay==='hidden';
  const hiddenValueLabel = name => variables[name].hiddenValueLabel ?? '?';
  const concealedValueMarkup = name => `<span class="concealed-value">${escapeAttribute(hiddenValueLabel(name))}</span>`;
  const concealedAccessibleDescription = name =>
    `value hidden${hiddenValueLabel(name) ? `; displaying ${hiddenValueLabel(name)}` : ''}`;
  function slot(name) {
    const config=variables[name];
    if (!config) throw new TypeError(`Formula references unconfigured variable ${name}`);
    const inferred=Object.hasOwn(config,'fixed') ? 'fixed'
      : (Array.isArray(config.values) || (!displayOnly && config.strictlyDependent===true)) ? 'varying' : null;
    const type=config.type ?? inferred;
    if (!['fixed','varying'].includes(type))
      throw new TypeError(`Variable ${name} needs type: "fixed" or "varying"`);
    if (displayOnly && !Object.hasOwn(config,'type'))
      throw new TypeError(`Display-only variable ${name} needs an explicit type`);
    if (!displayOnly && type!==inferred)
      throw new TypeError(`Variable ${name} has a type inconsistent with its interactive configuration`);
    // Even an explicit slot('y') call cannot create an omitted blue box.
    // Authors remain responsible for omitting its surrounding operators/equals sign.
    if (boxOmitted(name)) return '';
    const occurrence = occurrenceCounts[name] = (occurrenceCounts[name] || 0) + 1;
    // The variable name is part of an HTML attribute in the formula markup.
    const id=escapeAttribute(eqId(slotKey(name,occurrence)));
    const label=escapeAttribute(name);
    if (displayOnly) {
      if (config.latex!==undefined && typeof config.latex!=='string')
        throw new TypeError(`Display-only latex for ${name} must be a string`);
      const latex=config.latex || '';
      const concealed=valueConcealed(name);
      const body=concealed ? concealedValueMarkup(name) : latex ? texHTML(latex) : '';
      // Strict dependence also determines the visual type in display-only mode.
      // No interactive roles, tab stops, wheels, or event listeners are added.
      const appearance = type==='fixed' ? 'fixed' : config.strictlyDependent===true ? 'determined' : 'available';
      // Display-only descriptions name what is shown, not implementation roles.
      // When complete author MathML is supplied, individual boxes are hidden
      // from accessibility to avoid reading the same mathematics twice.
      const source = varyingNames.find(other => other!==name &&
        variables[other].strictlyDependent!==true);
      const kind = type==='fixed' ? `${name}, fixed value`
        : config.strictlyDependent===true
          ? `${name}, ${source ? `value based on ${source}` : 'not adjustable'}`
          : `${name}, variable`;
      const shown = concealed ? `, ${concealedAccessibleDescription(name)}`
        : latex ? (type==='fixed' ? ` ${latex}` : `, showing ${latex}`)
        : (type==='fixed' ? ' not shown' : ', value not shown');
      const summary=escapeAttribute(`${kind}${shown}`);
      return `<span class="slot display-only ${appearance}" id="${id}" data-static-variable="${label}" role="img" aria-label="${summary}"><span class="value-face" aria-hidden="true">${body}</span><span class="var-name" aria-hidden="true">${label}</span></span>`;
    }
    if (type==='fixed')
      return `<span class="slot fixed" id="${id}" data-fixed="${label}" role="img"><span class="value-face" aria-hidden="true"></span><span class="var-name" aria-hidden="true">${label}</span></span>`;
    return `<span class="slot available" id="${id}" data-variable="${label}" role="spinbutton" tabindex="0" aria-describedby="${eqId('wheel-keyboard-help')}"><span class="value-face" aria-hidden="true"></span><span class="var-name" aria-hidden="true">${label}</span></span>`;
  }
  function squared(name) {
    return `<span class="term"><span class="paren">(</span>${slot(name)}<span class="paren">)</span><sup class="power">2</sup></span>`;
  }
  // Build only the active example so occurrence counters stay per formula.
  // HTML/MathML rendering is otherwise unchanged from V17.1.
  // Authors can supply a formula builder; the in-file examples use the
  // existing formula catalogue for the regression demonstration.
  const helpers={slot,squared,staticMath,shieldMath};
  const equationMarkup=typeof formula==='function' ? formula(helpers) : window.FWExampleFormulaBuilders?.(exampleKey,helpers);
  if (typeof equationMarkup!=='string')
    throw new TypeError('A formula builder must return HTML for the formula');
  eqById('equation').innerHTML = equationMarkup;
  // A manipulable wheel must always have at least one visible control.
  // The strictly dependent output is allowed to have zero appearances.
  if (!displayOnly) {
    for (const [name,spec] of configs) {
      if (Array.isArray(spec.values) && !spec.strictlyDependent && !occurrenceCounts[name])
        throw new TypeError(`Manipulable quantity ${name} must have a visible slot in its formula`);
    }
  }
  // V20.11 experiment: authors may provide the COMPLETE symbolic mathematics in
  // LaTeX, separate from the HTML/CSS wheel layout. MathJax already knows how
  // to convert that LaTeX to structural MathML; do not parse formula HTML or
  // attempt to speak mathematical expressions ourselves.
  let accessibleMath = null;
  if (symbolicLatex !== null) {
    const serialized = MathJax.tex2mml(symbolicLatex);
    const parsed = new DOMParser().parseFromString(serialized,'application/xml');
    const math = parsed.documentElement;
    if (math.localName !== 'math' ||
        math.namespaceURI !== 'http://www.w3.org/1998/Math/MathML' ||
        parsed.querySelector('parsererror'))
      throw new Error('MathJax did not produce complete MathML for the supplied mathematics');
    accessibleMath = document.createElement('div');
    accessibleMath.className = 'sr-only accessible-math accessible-equation';
    accessibleMath.id = eqId('accessible-equation');
    const label = document.createElement('span');
    label.textContent = `${mathLabel}: `;
    accessibleMath.append(label, document.importNode(math,true));
    eqById('equation').before(accessibleMath);

    // The corresponding visual equation is now a control surface. Suppress
    // duplicated decorative operators/static values from the accessibility
    // tree, but NEVER hide an interactive or determined wheel. Wrapping bare
    // text with display:contents retains its original flexbox layout.
    function hideVisualDecorations(parent) {
      for (const child of [...parent.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (!child.textContent.trim()) continue;
          const wrapper = document.createElement('span');
          wrapper.setAttribute('aria-hidden','true');
          wrapper.style.display = 'contents';
          child.replaceWith(wrapper);
          wrapper.append(child);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.classList.contains('slot')) {
            if (displayOnly || child.classList.contains('fixed'))
              child.setAttribute('aria-hidden','true');
          } else if (!child.querySelector('.slot')) {
            child.setAttribute('aria-hidden','true');
          } else {
            hideVisualDecorations(child);
          }
        }
      }
    }
    hideVisualDecorations(eqById('equation'));
  }
  if (exercise.description != null) equationRoot.setAttribute('aria-label',exercise.description);
  equationRoot.classList.toggle('linear-demo',exampleKey==='linear' || exampleKey==='long');
  equationRoot.classList.toggle('fraction-demo',exampleKey==='fraction' || exampleKey==='revfraction');
  equationRoot.classList.toggle('fraction-reversed',exampleKey==='revfraction');
  equationRoot.classList.toggle('multi-demo',exampleKey==='multi' || exampleKey==='preferred-multi');

  if (displayOnly) {
    // Explain the noninteractive state once per figure rather than repeating
    // 'not adjustable' on every display-only box.
    const viewingIntro=document.createElement('p');
    viewingIntro.className='sr-only';
    viewingIntro.textContent='This formula is for viewing only. Its values cannot be changed here.';
    (accessibleMath || eqById('equation')).before(viewingIntro);
    // Render-once path: no wheel pools, state machine, event listeners,
    // subscriptions, ResizeObserver, timers, or derived mathematical lookup.
    // Static and interactive formulas have already used the same slot() helper
    // and MathJax cache. Intrinsic MathJax widths are measured from DOM.
    equationRoot.classList.add('display-only-formula');
    equationRoot.classList.toggle('labels-hidden', presentationState.showVariableTabs===false);
    const equation=eqById('equation');
    const staticSlots=[...equation.querySelectorAll('.slot.display-only')];
    function fitStaticSlots() {
      resetEquationScale(equation);
      for (const element of staticSlots) {
        const face=element.querySelector('.value-face');
        const mjx=face.querySelector('mjx-container[jax="CHTML"]');
        const style=getComputedStyle(element);
        const faceStyle=getComputedStyle(face);
        const fallback=element.classList.contains('fixed')?65:85;
        const minimum=parseFloat(style.getPropertyValue('--base-slot-width')) || fallback;
        if (!mjx) continue;
        let ink=parseFloat(getComputedStyle(mjx).width);
        if (!Number.isFinite(ink)||ink<=0) ink=mjx.getBoundingClientRect().width;
        // CHTML is laid out by the browser; the wrapper's measured width
        // already includes its glyphs, so SVG getBBox correction is not used.
        if (!Number.isFinite(ink)||ink<=0) continue;
        const px=value=>parseFloat(value)||0;
        const sidePadding=px(faceStyle.paddingLeft)+px(faceStyle.paddingRight);
        const borders=px(style.borderLeftWidth)+px(style.borderRightWidth);
        const outside=2*px(style.getPropertyValue('--slot-padding'))+
          px(style.getPropertyValue('--label-reserve'));
        const needed=ink+sidePadding+8+(style.boxSizing==='border-box'?borders:0);
        element.style.setProperty('--base-slot-width',
          `${Math.ceil(Math.max(minimum,needed-outside))}px`);
      }
      applyEquationScale(equation,fittedEquationScale(equation));
    }
    fitStaticSlots();
    equation.removeAttribute('aria-busy');
    // One low-cost layout observer keeps figures responsive when their slate
    // changes width. There are no wheel, pointer, keyboard, or scroll handlers.
    // The author may also call refit() after a custom layout transition.
    const staticObserver=new ResizeObserver(()=>fitStaticSlots());
    failureDisposers.push(()=>staticObserver.disconnect());
    staticObserver.observe(equationRoot);
    // CHTML glyph metrics can settle after initial MathJax preparation.
    // A formula width change does not necessarily resize its host.
    staticObserver.observe(equation);
    let staticDestroyed=false;
    function setStaticPresentation(options) {
      if (staticDestroyed) return;
      if (Object.hasOwn(options,'equationScale'))
        presentationState.equationScale=validateEquationScale(options.equationScale);
      if (Object.hasOwn(options,'showVariableTabs'))
        presentationState.showVariableTabs=Boolean(options.showVariableTabs);
      equationRoot.classList.toggle('labels-hidden', !presentationState.showVariableTabs);
      fitStaticSlots();
    }
    return Object.freeze({
      get displayOnly(){return true;},
      refit(){if (!staticDestroyed) fitStaticSlots();},
      setPresentation:setStaticPresentation,
      destroy(){
        if (staticDestroyed) return;
        staticDestroyed=true;
        mountedFormulaHosts.delete(equationRoot);
        staticObserver.disconnect();
        equation.replaceChildren();
        accessibleMath?.remove();
        viewingIntro.remove();
        resetEquationScale(equation);
        equationRoot.classList.remove('display-only-formula','labels-hidden',
          'linear-demo','fraction-demo','fraction-reversed','multi-demo');
        restoreHostAriaLabel();
        if (ownsGroupRole) equationRoot.removeAttribute('role');
        texHTMLCache.clear();
      }
    });
  }

  const interactionOwner = Symbol('formula-wheels-input-owner');
  ownersByRoot.set(equationRoot,interactionOwner);
  failureDisposers.push(()=>{
    releaseInputOwner(interactionOwner);
    ownersByRoot.delete(equationRoot);
  });
  // A strictly dependent varying quantity may have no canonical wheel array.
  // Keep it in the published/rendered variable set but never make it a wheel.
  const variableNames = Object.keys(variables).filter(name =>
    Array.isArray(variables[name].values) || variables[name].strictlyDependent===true);
  const dependentName = displayOnly ? null : strictlyDependentNames[0] ?? null;
  const inputName = dependentName ? variableNames.find(name=>name!==dependentName) : null;
  const wheelNames = variableNames.filter(name=>name!==dependentName);
  const valuesFor = name => variables[name].values ?? [];
  const anonymousLabels = exercise.anonymousLabels || {};
  const anonymousLabel = name => Object.hasOwn(anonymousLabels,name) && anonymousLabels[name]
    ? anonymousLabels[name] : `the ${name} value`;
  const revealVariableNames = () => presentationState.showVariableNamesInText;
  const showIndicators = () => presentationState.showChangeIndicators;
  const orderFor = name => variables[name].valueOrder ?? 'ascending';
  for (const name of variableNames) {
    if (!['ascending','descending','unordered'].includes(orderFor(name))) {
      throw new TypeError(`Invalid valueOrder for ${name}: ${orderFor(name)}`);
    }
  }
  // Derived lookup metadata, not author configuration or interaction state.
  const lookup = Object.fromEntries(variableNames.map(name => {
    const values = valuesFor(name);
    return [name, {
      byId: Object.fromEntries(values.map(entry => [entry.id, entry])),
      indices: Object.fromEntries(values.map((entry, i) => [entry.id, i])),
      min: Math.min(...values.map(entry => entry.value)),
      max: Math.max(...values.map(entry => entry.value))
    }];
  }));

  // Stage 1: all changing interaction data lives here, separate from `variables`.
  const state = {
    selected: Object.fromEntries(variableNames.map(name => [name, variables[name].initial])),
    active: null,       // Variable currently being edited
    pending: null,      // {input, other, options}; non-modal: same input can resume
    unresolved: null,   // Input for which no matching counterpart exists
    drag: null,
    keyboardEdit: null,  // Name of wheel navigating by keyboard (not committed)
    wheelEdit: null,     // Name of variable being previewed by mouse wheel/trackpad
    beforeEdit: null,    // Last confirmed pair; preserved across all popup resumptions
    // Each entry is either null or {entry, fromVariable, fromEntry}.
    // The provenance is attached to the particular entry, not to the formula.
    temporary: Object.fromEntries(variableNames.map(name => [name,null]))
  };

  // Render/gesture lookup contains an ephemeral sorted insertion if present.
  // Rebuilding this view changes logical-index membership; paintWheel checks
  // each DOM node against the current entry identity, not index alone.
  // Its arrays and indexes are NEVER written back to `variables`.
  const wheelView = Object.create(null);
  function rebuildWheelView(name) {
    const values = valuesFor(name).slice();
    const temp = state.temporary[name];
    if (temp && !Object.hasOwn(lookup[name].byId,temp.entry.id)) {
      // The original author array is NEVER mutated. A temporary entry is
      // inserted according to the author-declared ordering, not a comparison
      // of adjacent outputs to infer the direction indicator. For unordered
      // arrays, append consistently; arrows are suppressed for that variable.
      const order = orderFor(name);
      const at = order==='unordered' ? -1 : values.findIndex(v =>
        order==='descending' ? v.value < temp.entry.value : v.value > temp.entry.value);
      values.splice(at < 0 ? values.length : at,0,temp.entry);
    }
    wheelView[name] = {
      values,
      indices: Object.fromEntries(values.map((entry,i) => [entry.id,i])),
      byId: Object.fromEntries(values.map(entry => [entry.id,entry])),
      min: Math.min(...values.map(entry => entry.value)),
      max: Math.max(...values.map(entry => entry.value))
    };
  }
  variableNames.forEach(rebuildWheelView);
  function setTemporary(name, record) {
    state.temporary[name] = record;
    rebuildWheelView(name);
  }
  function selectOutput(name, entry, fromVariable, fromEntry) {
    // An existing canonical ID always means a normal, non-transient value.
    const canonical = lookup[name].byId[entry.id];
    setTemporary(name, canonical ? null : {entry, fromVariable, fromEntry});
    state.selected[name] = entry.id;
  }
  function selectedEntry(name) {
    return wheelView[name].byId[state.selected[name]];
  }
  const popup = eqById('choice-popup');
  const popupLabel = eqById('choice-label');
  const popupButtons = eqById('choice-buttons');
  // The tray is an inline, non-modal choice group. Avoid a second live region
  // while its children are replaced and keyboard focus moves among choices.
  popup.setAttribute('role','group');
  popup.setAttribute('aria-labelledby',popupLabel.id);
  popup.setAttribute('aria-live','off');
  const announcement=document.createElement('div');
  announcement.id=eqId('wheel-announcement');
  announcement.className='sr-only';
  announcement.setAttribute('role','status');
  announcement.setAttribute('aria-atomic','true');
  equationRoot.append(announcement);
  function announce(message) { announcement.textContent=message; }
  function spokenName(name) {
    return revealVariableNames() ? name : anonymousLabel(name);
  }
  function announceResult(input, chosen, output, result, committedDirection=null) {
    const source=`${spokenName(input)}: ${spokenValue(chosen)}`;
    // An omitted box is not part of the formula's spoken output. External
    // visualizations may present the dependent quantity independently.
    if (boxOmitted(output)) { announce(`${source}.`); return; }
    if (valueConcealed(output)) {
      // The visual arrow is not live-announced; speak its direction after
      // confirmation without repeating the static "value hidden" description.
      if (!result.options.length) {
        announce(`${source}. ${spokenName(output)} has no output.`);
      } else {
        const direction=changeTracker[output]?.direction ?? committedDirection;
        announce(`${source}. ${spokenName(output)} ${direction ?? 'updated'}.`);
      }
      return;
    }
    if (!result.options.length) {
      announce(`${source}. ${spokenName(output)} has no output: ${presentationState.noOutputsLabel}.`);
    } else if (result.options.length===1) {
      announce(`${source}. ${spokenName(output)}: ${spokenValue(result.options[0])}.`);
    } else if (result.preferred && choiceBehavior()==='automatic') {
      announce(`${source}. ${spokenName(output)} selected automatically: ${spokenValue(result.preferred)}.`);
    }
  }
  popup.hidden = true;
  popupButtons.replaceChildren();
  // DOM order is semantic order: occurrences[name][0] is the leftmost
  // appearance and is the focus / popup anchor for the whole variable.
  const occurrences = Object.fromEntries(variableNames.map(name => [name,
    [...equationRoot.querySelectorAll('.slot[data-variable]')].filter(slot => slot.dataset.variable === name)
  ]));
  // Keep a first-appearance alias for compatibility with V17's focus handling.
  const slots = Object.fromEntries(variableNames.map(name => [name, occurrences[name][0]]));
  const allSlots = variableNames.flatMap(name => occurrences[name]);
  const nextName = name => variableNames.find(other => other !== name);

  // The direction is calculated once per variable, then shown above EVERY
  // appearance of that variable (including synchronized repeated slots).
  // Later visual copies are hidden from assistive technology to avoid repeating
  // the same message in browse mode. Indicators remain outside formula layout.
  const stage = equationRoot;
  const changeIndicators = Object.create(null);
  const changeTracker = Object.fromEntries(variableNames.map(name => [name, {
    mode:null, entry:null, sourceId:null, direction:null, fadeTimer:null
  }]));
  const INDICATOR_HOLD_MS = 600; // 600 ms after the last actual value change
  variableNames.forEach(name => {
    if (!variables[name].showChangeIndicator) return;
    changeIndicators[name] = occurrences[name].map((_, index) => {
      const indicator = document.createElement('span');
      indicator.className = 'change-indicator';
      indicator.dataset.variable = name;
      indicator.setAttribute('aria-live', 'off'); // never live-announce wheel previews
      if (index > 0) indicator.setAttribute('aria-hidden', 'true');
      indicator.innerHTML = '<span class="change-arrow" aria-hidden="true"></span><span class="change-description"></span>';
      stage.append(indicator);
      return indicator;
    });
  });

  function hideChangeIndicator(name) {
    const tracker = changeTracker[name];
    if (tracker.fadeTimer !== null) clearTimeout(tracker.fadeTimer);
    tracker.fadeTimer = null;
    tracker.direction = null;
    for (const indicator of changeIndicators[name] ?? []) indicator.classList.remove('visible');
  }
  function resetChangeIndicators() {
    for (const name of variableNames) {
      hideChangeIndicator(name);
      changeTracker[name].entry = null;
      changeTracker[name].mode = null;
      changeTracker[name].sourceId = null;
    }
  }
  // Give both old and new ephemeral outputs a place in ONE temporary ordered
  // view. Merely checking their insertion indices separately could report
  // zero movement when two distinct temporary outputs occupy the same gap.
  // Direction uses ordered indices, not magnitudes. Exact equality only
  // distinguishes two equivalent representations, such as 2 and sqrt(4).
  // Null means no change to report; zero means explicitly "unchanged".
  function directionBetweenEntries(name, previous, current) {
    if (!previous || !current || previous.id === current.id) return null;
    const order = orderFor(name);
    if (order === 'unordered') return null;
    if (previous.value === current.value) return 0;
    const canonical = valuesFor(name);
    let previousIndex = lookup[name].indices[previous.id];
    let currentIndex = lookup[name].indices[current.id];
    if (previousIndex === undefined || currentIndex === undefined) {
      const combined = canonical.slice();
      for (const entry of [previous, current]) {
        if (combined.some(v => v.id === entry.id)) continue;
        const insertion = combined.findIndex(v =>
          order==='descending' ? v.value < entry.value : v.value > entry.value);
        combined.splice(insertion < 0 ? combined.length : insertion, 0, entry);
      }
      previousIndex = combined.findIndex(v => v.id === previous.id);
      currentIndex = combined.findIndex(v => v.id === current.id);
    }
    return Math.sign(currentIndex - previousIndex) * (order==='descending' ? -1 : 1);
  }
  // Called once per rendered underlying variable, NOT once per occurrence.
  // Blue comparisons only use successive, unique displayed outputs. After
  // ambiguity (zero or many outputs), wait for a fresh single-value baseline.
  function observeChange(name, mode, entry, sourceId=null) {
    const tracker = changeTracker[name];
    if (!entry || orderFor(name)==='unordered' || !variables[name].showChangeIndicator) {
      tracker.entry = null;
      tracker.mode = mode;
      tracker.sourceId = sourceId;
      hideChangeIndicator(name);
      return;
    }
    if (tracker.mode === mode && tracker.entry) {
      let direction = directionBetweenEntries(name, tracker.entry, entry);
      // A constant function can return the SAME output entry when its input
      // changes. "Unchanged" should describe that mathematical transition,
      // but never an idle re-render when nothing has moved.
      if (direction === null && mode === 'blue' &&
          tracker.sourceId !== null && tracker.sourceId !== sourceId) direction = 0;
      if (direction !== null && showIndicators()) {
        tracker.direction = direction > 0 ? 'increasing' :
                            direction < 0 ? 'decreasing' : 'unchanged';
        for (const indicator of changeIndicators[name] ?? []) {
          indicator.classList.toggle('increasing', direction > 0);
          indicator.classList.toggle('decreasing', direction < 0);
          indicator.classList.toggle('unchanged', direction === 0);
          indicator.querySelector('.change-arrow').textContent =
            direction > 0 ? '↑' : direction < 0 ? '↓' : '—';
          indicator.classList.add('visible');
        }
        updateChangeIndicatorText(name);
        if (tracker.fadeTimer !== null) clearTimeout(tracker.fadeTimer);
        tracker.fadeTimer = setTimeout(() => {
          tracker.fadeTimer = null;
          for (const indicator of changeIndicators[name] ?? []) indicator.classList.remove('visible');
          tracker.direction = null;
        }, INDICATOR_HOLD_MS);
      }
    }
    tracker.mode = mode;
    tracker.entry = entry;
    tracker.sourceId = sourceId;
  }
  function updateChangeIndicatorText(name) {
    const indicators = changeIndicators[name];
    const direction = changeTracker[name].direction;
    if (!indicators || !direction) return;
    for (const indicator of indicators) {
      const label = indicator.querySelector('.change-description');
      label.replaceChildren();
      if (revealVariableNames()) {
        label.textContent = `${name} ${direction}`;
      } else {
        const extra = document.createElement('span');
        extra.className = 'sr-only';
        extra.textContent = `${anonymousLabel(name)} `;
        label.append(extra, document.createTextNode(direction));
      }
    }
  }
  function positionChangeIndicators() {
    const stageRect = stage.getBoundingClientRect();
    // Change indicators live outside the scaled formula, just like the popup.
    // Use the same relative author scale to keep the complete visual system
    // proportional without changing 20.4.1's default mobile typography.
    const indicatorScale=Math.min(presentationState.equationScale,
      fittedEquationScale(eqById('equation'))/responsiveBaselineScale());
    const placed = [];
    for (const name of variableNames) {
      for (const [index, indicator] of (changeIndicators[name] ?? []).entries()) {
        indicator.style.transform=`translate(-50%,-50%) scale(${indicatorScale})`;
        const anchor = occurrences[name][index].getBoundingClientRect();
        const indicatorRect=indicator.getBoundingClientRect();
        const width=indicatorRect.width;
        const halfHeight=indicatorRect.height/2;
        const x = Math.max(width/2 + 8, Math.min(stageRect.width-width/2-8,
          anchor.left + anchor.width/2-stageRect.left));
        // Prefer above each box. Stagger labels if repeated occurrences overlap.
        let y = anchor.top - stageRect.top - 21*indicatorScale;
        let rect = {left:x-width/2, right:x+width/2,
          top:y-halfHeight, bottom:y+halfHeight};
        while (placed.some(r => rect.left<r.right+4 && rect.right>r.left-4 &&
                                rect.top<r.bottom+2 && rect.bottom>r.top-2)) {
          y -= indicatorRect.height+6;
          rect = {...rect, top:y-halfHeight, bottom:y+halfHeight};
        }
        indicator.style.left = `${x}px`;
        indicator.style.top = `${y}px`;
        placed.push(rect);
      }
    }
  }

  function updateSlotAccessibleLabels() {
    for (const name of variableNames) {
      const label = revealVariableNames() ? name : anonymousLabel(name);
      for (const slot of occurrences[name]) slot.setAttribute('aria-label', `Choose ${label}`);
    }
  }
  function renderPopupPrompt(other) {
    popupLabel.replaceChildren();
    if (revealVariableNames()) {
      popupLabel.textContent = `Choose a value for ${other}.`;
    } else {
      popupLabel.textContent = 'Choose a value.';
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = ` For ${anonymousLabel(other)}.`;
      popupLabel.append(sr);
    }
  }
  function populatePendingButtons() {
    if (!state.pending) return;
    const { input, other, options, preferredId } = state.pending;
    const chosen = selectedEntry(input);
    popupButtons.replaceChildren();
    renderPopupPrompt(other);
    for (const entry of options) {
      const button = document.createElement('button');
      button.type = 'button';
      const isPreferred = preferredId === entry.id;
      button.innerHTML = styledMathHTML(entry,isPreferred,false);
      button.setAttribute('aria-label',
        (revealVariableNames() ? spokenValue(entry) : `${spokenValue(entry)} for ${anonymousLabel(other)}`)
        + (isPreferred ? ', highlighted option' : ''));
      button.addEventListener('click', () => {
        selectOutput(other, entry, input, chosen);
        hidePopup(); clearEditSnapshot(); render();
        announce(`${spokenName(other)} selected: ${spokenValue(entry)}. ${spokenName(input)}: ${spokenValue(chosen)}.`);
        releaseInputOwner(interactionOwner);
        slots[other].focus({preventScroll:true});
      },{signal:lifetime.signal});
      popupButtons.append(button);
    }
  }
  // V20.7: a pending blue box is exposed as a button, so it must activate
  // like one. The tray is already open; activation moves focus to its first
  // existing choice instead of creating a second popup or changing values.
  function focusPendingChoice(name) {
    if (!state.pending || state.pending.other !== name || popup.hidden) return;
    popupButtons.querySelector('button')?.focus({preventScroll:true});
  }
  for (const name of variableNames) {
    for (const slot of occurrences[name]) {
      slot.addEventListener('click', () => {
        if (slot.classList.contains('awaiting')) focusPendingChoice(name);
      }, {signal:lifetime.signal});
      slot.addEventListener('keydown', e => {
        if (!slot.classList.contains('awaiting') ||
            (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        focusPendingChoice(name);
      }, {signal:lifetime.signal});
    }
  }
  function applyPresentationOptions() {
    equationRoot.classList.toggle('labels-hidden', !presentationState.showVariableTabs);
    equationRoot.classList.toggle('prompt-names-hidden', !presentationState.showVariableNamesInText);
    equationRoot.classList.toggle('indicators-hidden', !showIndicators());
    if (!showIndicators()) for (const name of variableNames) hideChangeIndicator(name);
    updateSlotAccessibleLabels();
    for (const name of variableNames) updateChangeIndicatorText(name);
    positionChangeIndicators();
    if (state.pending) {
      populatePendingButtons();
      render();
      queueLayoutFrame(positionPopup);
    }
  }
  // The fixed terms are defined in configuration rather than interaction state.
  for (const [name,config] of Object.entries(variables)) {
    if (!Object.hasOwn(config,'fixed')) continue;
    const fixedSlot = eqById(slotKey(name));
    fixedSlot.querySelector('.value-face').innerHTML = texHTML(String(config.fixed));
    fixedSlot.setAttribute('aria-label', `${name} is fixed at ${config.fixed}`);
  }
  // Capture layout widths before any blue-box class changes, so remeasuring
  // after webfonts load does not mistake a determined width for a base width.
  const baseWidths = Object.fromEntries(variableNames.map(name =>
    [name, occurrences[name].map(slot => slot.offsetWidth)]
  ));
  // V20.3.1: The blue boxes already measure rendered math, but green boxes
  // previously retained a fixed author/CSS width. Remember each occurrence's
  // original minimum before applying any measured, entry-specific width.
  const greenMinimumBaseWidths = Object.fromEntries(variableNames.map(name =>
    [name, occurrences[name].map(slot =>
      parseFloat(getComputedStyle(slot).getPropertyValue('--base-slot-width')) || 85)]
  ));
  // The MathJax HTML is cached, and the measured intrinsic width is cached
  // per variable / font-size / LaTeX. No MathJax conversion is performed here.
  const greenMathWidthCache = new Map();
  // Leave a little clearance beyond the CSS padding, particularly for ink
  // around radicals and the lower-right variable tab.
  const GREEN_INK_CLEARANCE = 8;
  function fitGreenValueFace(name, slot, face, entry, appearanceIndex) {
    if (!entry) return;
    const faceStyle=getComputedStyle(face);
    const slotStyle=getComputedStyle(slot);
    const cacheKey=JSON.stringify([name,entry.latex,faceStyle.fontSize,faceStyle.fontFamily]);
    let inkWidth=greenMathWidthCache.get(cacheKey);
    if (inkWidth===undefined) {
      // Measure the actual rendered MathJax DOM rather than estimating from
      // characters or the entry's numeric value. Computed CSS widths are in
      // untransformed CSS pixels, so this is correct even when the equation
      // has been scaled to fit a mobile screen.
      const container=face.querySelector('mjx-container[jax="CHTML"]');
      if (!container) return;
      inkWidth=parseFloat(getComputedStyle(container).width);
      if (!Number.isFinite(inkWidth) || inkWidth<=0) {
        // Some engines report 'auto' for the MathJax wrapper. Recover its
        // intrinsic width from the actual rect, undoing equation scaling.
        const equation=eqById('equation');
        const scale=equation.offsetWidth>0 ?
          equation.getBoundingClientRect().width/equation.offsetWidth : 1;
        inkWidth=container.getBoundingClientRect().width/(scale || 1);
      }
      // CHTML's computed wrapper width (or corrected DOM rect) is the
      // intrinsic layout width; there are no SVG paths to measure.
      if (!Number.isFinite(inkWidth) || inkWidth<=0) return;
      greenMathWidthCache.set(cacheKey,inkWidth);
    }
    const toNumber=value=>parseFloat(value)||0;
    const horizontalFacePadding=toNumber(faceStyle.paddingLeft)+toNumber(faceStyle.paddingRight);
    const borders=toNumber(slotStyle.borderLeftWidth)+toNumber(slotStyle.borderRightWidth);
    const slotExtra=2*toNumber(slotStyle.getPropertyValue('--slot-padding'))+
      toNumber(slotStyle.getPropertyValue('--label-reserve'));
    // CSS width is a content-box unless an embedding stylesheet changes it.
    // The exact calculation respects the box-sizing of the current slate.
    const declaredWidth=inkWidth+horizontalFacePadding+GREEN_INK_CLEARANCE+
      (slotStyle.boxSizing==='border-box' ? borders : 0);
    const baseWidth=Math.max(greenMinimumBaseWidths[name][appearanceIndex],
      Math.ceil(declaredWidth-slotExtra));
    const widthValue=`${baseWidth}px`;
    if (slot.style.getPropertyValue('--base-slot-width')!==widthValue)
      slot.style.setProperty('--base-slot-width',widthValue);
  }
  applyPresentationOptions();

  function mathHTML(entry) {
    return entry ? texHTML(entry.latex) : '';
  }
  // V21.7.3: the optional author-supplied description is the sole
  // override used by every dynamic spoken-value path. It is plain text,
  // never HTML. The fallback is unchanged for existing exercise authors.
  function spokenValue(entry) {
    return entry.speech === undefined ? entry.latex.replace('-\\sqrt{','negative square root of ')
      .replace('\\sqrt{','square root of ').replace('}','') : entry.speech.trim();
  }
  // Diagnostic records do not affect accessibility output, mathematics or
  // rendering; they identify expressions for which the legacy fallback may
  // not produce useful speech. Authors can inspect instance.debug.speechDiagnostics.
  const speechDiagnostics = new Map();
  function auditSpeech(entry, context) {
    if (entry.speech !== undefined || !/[\\{}^_]/.test(entry.latex) ||
        /^-?\\sqrt\{-?\d+(?:\.\d+)?\}$/.test(entry.latex)) return;
    const key = JSON.stringify([context,entry.id,entry.latex]);
    if (!speechDiagnostics.has(key) && speechDiagnostics.size < 200)
      speechDiagnostics.set(key,{context,id:entry.id,latex:entry.latex,
        recommendation:'Add a plain-text speech description to this value entry.'});
  }
  // Both author return formats are supported:
  //    [entry, ...] OR {options:[entry,...], preferredId:'stable-id'}.
  // An invalid/omitted preferredId means no default, never an implicit first
  // option. Temporary entries preserve their original paired provenance.
  function normalizeOutputResult(result, changedVariable=null) {
    const returnedArray = Array.isArray(result);
    const options = returnedArray ? result : result?.options;
    if (!Array.isArray(options))
      throw new TypeError('permissibleOutputs must return an array or {options, preferredId}');
    // A locked output has zero or one permitted entry; [] remains a valid
    // author-controlled way to describe an undefined/no-output case.
    if (dependentName && changedVariable===inputName && options.length>1)
      throw new RangeError(`Strictly dependent ${dependentName}: permissibleOutputs(${inputName}, ...) returned ${options.length} entries; expected at most one`);
    for (const entry of options) {
      if (!entry || typeof entry.id !== 'string' ||
          typeof entry.latex !== 'string' || !Number.isFinite(entry.value))
        throw new TypeError('Every permissible output must have {id, latex, value}');
      if (entry.branchKey !== undefined && typeof entry.branchKey !== 'string')
        throw new TypeError('branchKey, when supplied, must be a string');
      validateOptionalSpeech(entry, `Permissible output ${entry.id}`);
      auditSpeech(entry, `output of ${changedVariable ?? 'an input'}`);
    }
    const id = returnedArray ? null : result.preferredId;
    const preferred = typeof id === 'string' ? options.find(v => v.id === id) : null;
    return {options, preferredId: preferred?.id ?? null, preferred: preferred ?? null};
  }
  function possibleResult(changedVariable, selected) {
    const origin = state.temporary[changedVariable];
    if (origin && selected.id === origin.entry.id) {
      const original = wheelView[origin.fromVariable].byId[origin.fromEntry.id]
        || origin.fromEntry;
      return {options:[original], preferredId:null, preferred:null};
    }
    return normalizeOutputResult(permissibleOutputs(changedVariable, selected),changedVariable);
  }

  // Use MathJax's bold mathematical glyphs (not CSS font-weight on SVG paths),
  // then add the shadow to the rendered expression without tinting its box.
  // All versions are cached in the same MathJax cache; no typesetting while
  // the wheels move. Backslash/notation for the canonical entry is unchanged.
  function styledMathHTML(entry, preferred, faded) {
    const latex = preferred ? `\\boldsymbol{${entry.latex}}` : entry.latex;
    const markup = texHTML(latex);
    return preferred ? `<span class="preferred-expression">${markup}</span>`
      : faded ? `<span class="nonpreferred-expression">${markup}</span>` : markup;
  }
  // Two: a or b. Three or more: a, b, or c. Use the same wording
  // for blue values and accessible descriptions; choices remain independent
  // buttons in the popup beneath the formula.
  function listSeparator(index, count) {
    if (index === count - 1) return count > 2 ? ', or ' : ' or ';
    return ', ';
  }
  function describeOptions(entries) {
    return entries.map((entry,i) => (i ? listSeparator(i,entries.length) : '') + spokenValue(entry)).join('');
  }
  function displayValues(entries, preferredId=null, fadeOthers=false) {
    if (!entries.length) return `<span class="none">${escapeAttribute(presentationState.noOutputsLabel)}</span>`;
    // Attach each comma to the preceding mathematical item so spacing stays
    // natural. The final "or" remains a separate token between members.
    const content = entries.map((entry,i) => {
      const comma = entries.length > 2 && i < entries.length-1
        ? '<span class="list-comma">,</span>' : '';
      const conjunction = i === entries.length-1 && i > 0
        ? '<span class="or">or</span>' : '';
      return `${conjunction}<span class="list-member">${styledMathHTML(entry,preferredId===entry.id,
        fadeOthers && preferredId!==null && preferredId!==entry.id)}${comma}</span>`;
    }).join('');
    return `<span class="alternatives">${content}</span>`;
  }
  // Measure every result that each blue box might show.  Store one stable
  // determined-state width per variable so later value changes don't make
  // the equation jump.  Width includes the blue value-face's 18px side
  // padding on both sides, borders, and extra slot padding. 
  // The CSS box grows by the same amount, keeping its usable content width.
  // All author-known values and relationship outputs are typeset once on
  // mounting the exercise. Dragging, wheel virtualization, and popup updates
  // only reuse cached math markup, never invoke MathJax.
  function primeMathCache() {
    for (const name of variableNames)
      for (const entry of valuesFor(name)) {
        auditSpeech(entry, `selectable ${name}`);
        texHTML(entry.latex);
      }
    for (const name of wheelNames) {
      for (const entry of valuesFor(name)) {
        // Validate every author-defined output as before, but do not typeset
        // math markup for a permanently concealed or omitted dependent box.
        const result = normalizeOutputResult(permissibleOutputs(name,entry),name);
        if (dependentName && (valueConcealed(dependentName) || boxOmitted(dependentName))) continue;
        for (const output of result.options) texHTML(output.latex);
        // Prime the bold variant too. Movement must only reuse cached SVG,
        // never synchronously typeset when entering a new choice branch.
        if (result.preferred) texHTML(`\\boldsymbol{${result.preferred.latex}}`);
      }
    }
    texHTML('0'); // possible value for a zero-result or a fixed constant
  }
  primeMathCache();
  function measureDeterminedWidths() {
    const probe = document.createElement('span');
    probe.className = 'determined-width-probe';
    equationRoot.append(probe);
    for (const name of variableNames) {
      if (dependentName && name!==dependentName) continue;
      // An omitted dependent quantity has no blue box to size. Preserve its
      // numerical calculations and subscriptions without layout measurement.
      if (!occurrences[name]?.length) continue;
      const other = nextName(name);
      let widest = 0;
      if (valueConcealed(name)) {
        probe.innerHTML = concealedValueMarkup(name);
        widest = probe.getBoundingClientRect().width;
      } else {
        for (const inputValue of valuesFor(other)) {
          const result = possibleResult(other, inputValue);
          probe.innerHTML = displayValues(result.options,
            result.options.length>1 ? result.preferredId : null,
            choiceBehavior()==='automatic' && result.options.length>1);
          widest = Math.max(widest, probe.getBoundingClientRect().width);
        }
      }
      // The CSS padding is included in the box width (border-box sizing).
      // The determined value has balanced 4px side padding, its own 18px
      // horizontal buffer, borders, and a small gap from the variable tab.
      occurrences[name].forEach((slot, i) => {
        const extraPadding = parseFloat(getComputedStyle(slot).getPropertyValue('--slot-padding')) || 0;
        const determinedWidth = Math.max(baseWidths[name][i], Math.ceil(widest + 42 + 2 * extraPadding));
        slot.style.setProperty('--determined-width', `${determinedWidth}px`);
      });
    }
    probe.remove();
  }
  // A variable owns ONE selected value, but each occurrence has its own
  // seven-node virtual wheel, renderer cache, focus target, and hit targets.
  const wheels = Object.create(null);
  const seams = Object.create(null);
  const POOL_SIZE = 7;
  const POOL_RADIUS = (POOL_SIZE - 1) / 2;
  const ringIndex = logicalIndex => ((logicalIndex % POOL_SIZE) + POOL_SIZE) % POOL_SIZE;
  wheelNames.forEach(name => {
    wheels[name] = [];
    seams[name] = [];
    occurrences[name].forEach((slot, appearanceIndex) => {
    const face = slot.querySelector('.value-face');
    const svgNS='http://www.w3.org/2000/svg';
    const ribbon=document.createElementNS(svgNS,'svg');
    ribbon.setAttribute('class','wheel-ribbon');
    ribbon.setAttribute('viewBox','0 0 100 240');
    // SVG defaults to preserveAspectRatio='xMidYMid meet'. A wider slot
    // therefore letterboxes its 100-unit cylinder drawing horizontally.
    // Stretch only the drawing's horizontal coordinate to fill this slot.
    ribbon.setAttribute('preserveAspectRatio','none');
    ribbon.setAttribute('aria-hidden','true');
    // Gradient IDs must be safe HTML attribute values and unique across
    // instances/appearances; a numeric wheel index avoids interpolating names.
    const gradientKey=`${wheelNames.indexOf(name)}-${appearanceIndex}`;
    const fadeGradientId=eqId(`drum-fade-${gradientKey}`);
    const lightGradientId=eqId(`drum-light-${gradientKey}`);
    const edgeGradientId=eqId(`drum-edge-${gradientKey}`);
    ribbon.innerHTML=`
      <defs>
        <!-- At the top and bottom, a cylinder's visible front surface turns edge-on. -->
        <linearGradient id="${fadeGradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#a9e4ac" stop-opacity="0"/>
          <stop offset="12%" stop-color="#a9e4ac" stop-opacity=".045"/>
          <stop offset="27%" stop-color="#a9e4ac" stop-opacity=".14"/>
          <stop offset="50%" stop-color="#a2e3a6" stop-opacity=".22"/>
          <stop offset="73%" stop-color="#a9e4ac" stop-opacity=".14"/>
          <stop offset="88%" stop-color="#a9e4ac" stop-opacity=".045"/>
          <stop offset="100%" stop-color="#a9e4ac" stop-opacity="0"/>
        </linearGradient>
        <!-- Side-to-side shading suggests curvature without pinching the sides. -->
        <linearGradient id="${lightGradientId}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#63a66c" stop-opacity=".18"/>
          <stop offset="16%" stop-color="#ffffff" stop-opacity=".10"/>
          <stop offset="50%" stop-color="#ffffff" stop-opacity=".36"/>
          <stop offset="82%" stop-color="#ffffff" stop-opacity=".09"/>
          <stop offset="100%" stop-color="#63a66c" stop-opacity=".18"/>
        </linearGradient>
        <linearGradient id="${edgeGradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6cb975" stop-opacity="0"/>
          <stop offset="20%" stop-color="#6cb975" stop-opacity=".21"/>
          <stop offset="50%" stop-color="#6cb975" stop-opacity=".32"/>
          <stop offset="80%" stop-color="#6cb975" stop-opacity=".21"/>
          <stop offset="100%" stop-color="#6cb975" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect x="0" y="7" width="100" height="226" fill="url(#${fadeGradientId})"/>
      <rect x="0" y="7" width="100" height="226" fill="url(#${lightGradientId})" opacity=".26"/>
      <path d="M0 7 V233" stroke="url(#${edgeGradientId})" stroke-width="1.1" fill="none"/>
      <path d="M100 7 V233" stroke="url(#${edgeGradientId})" stroke-width="1.1" fill="none"/>
    `;
    slot.prepend(ribbon);
    const seamNodes=Array.from({length:POOL_SIZE},()=>{
      const seam=document.createElement('span');
      seam.className='wheel-seam'; slot.append(seam); return seam;
    });
    // One shared opacity layer per occurrence, leaving the seven MathJax-rendered
    // numbers and their individual cylindrical projection logic unchanged.
    const numberLayer = document.createElement('span');
    numberLayer.className = 'wheel-number-layer';
    numberLayer.setAttribute('aria-hidden','true');
    slot.append(numberLayer);
    const numberNodes = Array.from({length:POOL_SIZE}, () => {
      const element = document.createElement('span');
      element.className='wheel-number';
      element.setAttribute('aria-hidden','true'); numberLayer.append(element); return element;
    });
    const stepTargets = {};
    wheels[name].push({slot, face, nodes:numberNodes, stepTargets});
    seams[name].push(seamNodes);
    // The neighboring values share the wheel's pointer handler. A quick tap
    // advances one entry; a held drag rotates the same wheel. Previously these
    // transparent buttons stopped pointerdown bubbling, which prevented a
    // gesture that started on a visible neighboring value from dragging.
    // They are excluded from the Tab sequence: the spinbutton has the keyboard
    // alternatives (arrows, Page Up/Down, Enter) and accessible value labels.
    for (const [direction,change] of [['above',1],['below',-1]]) {
      const btn=document.createElement('button'); btn.type='button';
      btn.tabIndex = -1;
      btn.className='step-target '+direction;
      btn.dataset.stepChange=String(change);
      btn.setAttribute('aria-label',`${change===1?'Next':'Previous'} ${name} value`);
      // A synthetic click (for example from accessibility software) should
      // still perform a one-entry step. Native pointer clicks are handled by
      // the shared pointerup handler; avoid running the step a second time.
      btn.addEventListener('click', event => {
        if (event.detail !== 0) return;
        if (state.drag || (state.pending && state.pending.input!==name)) return;
        if (state.keyboardEdit) cancelEdit();
        // Synthetic neighboring-value taps can also resume a pending branch.
        if (!begin(name)) return;
        setActiveIndex(Math.max(0,Math.min(wheelView[name].values.length-1,wheelView[name].indices[state.selected[name]]+change)));
        finish();
      },{signal:lifetime.signal});
      slot.append(btn);
      stepTargets[direction] = btn;
    }
    });
  });

  // Orthographic projection of a *front-facing* cylinder about a horizontal axis.
  // θ is the angular distance from the front of the drum: y = -R sin θ,
  // and text height is proportional to cos θ. Text WIDTH stays constant.
  // Unlike V6, neither the surface nor the digits pinch horizontally.
  const radius = 98;
  const angleStep = 0.63; // Same curvature as V15.
  const horizon = Math.PI / 2;
  function project(distance) {
    const angle = Math.abs(distance) * angleStep;
    const limited = Math.min(angle, horizon);
    return {
      y: -Math.sign(distance) * radius * Math.sin(limited),
      height: Math.max(0.015, Math.cos(limited)),
      visible: angle < horizon,
      opacity: Math.pow(Math.max(0, Math.cos(limited)), 1.2)
    };
  }
  // Map each logical index to a stable ring position. When moving one step,
  // still-visible numbers keep their own DOM nodes and animate continuously;
  // the one recycled node moves from an invisible end to the other invisible
  // end, avoiding the central-number flicker of a shifting array window.
  function paintWheel(name, position) {
    const values = wheelView[name].values;
    const center = Math.round(position);
    const selectedIndex = wheelView[name].indices[state.selected[name]];
    for (let appearanceIndex=0; appearanceIndex<wheels[name].length; appearanceIndex++) {
      const nodes = wheels[name][appearanceIndex].nodes;
      const seamNodes = seams[name][appearanceIndex];
      for (let offset = -POOL_RADIUS; offset <= POOL_RADIUS; offset++) {
        const logicalIndex = center + offset;
        const item = nodes[ringIndex(logicalIndex)];
        const seam = seamNodes[ringIndex(logicalIndex)];
        const inRange = logicalIndex >= 0 && logicalIndex < values.length;
        const p = project(logicalIndex - position);

        // As in V17.1, cache by mathematical entry, notation, AND position.
        // Each appearance has an independent cache, but both use one position.
        const entry = inRange ? values[logicalIndex] : null;
        const renderKey = entry ? JSON.stringify([logicalIndex,entry.id,entry.latex])
                                : `empty:${logicalIndex}`;
        if (item.dataset.renderKey !== renderKey) {
          item.style.transition = 'none';
          item.dataset.renderKey = renderKey;
          item.dataset.valueIndex = String(logicalIndex);
          item.dataset.entryId = entry?.id ?? '';
          item.innerHTML = entry ? mathHTML(entry) : '';
        }
        item.style.transform = `translate(-50%,-50%) translateY(${p.y}px) scaleY(${p.height})`;
        item.style.opacity = String(inRange && p.visible ? p.opacity * 0.84 : 0);
        item.style.visibility = inRange && p.visible ? 'visible' : 'hidden';
        item.classList.toggle('selected', logicalIndex === selectedIndex);

        const seamInRange = logicalIndex >= 0 && logicalIndex < values.length - 1;
        const sp = project(logicalIndex + 0.5 - position);
        if (seam.dataset.valueIndex !== String(logicalIndex)) {
          seam.style.transition = 'none';
          seam.dataset.valueIndex = String(logicalIndex);
        }
        seam.style.transform = `translate(-50%,-50%) translateY(${sp.y}px)`;
        seam.style.opacity = String(seamInRange && sp.visible ? 0.12 * sp.opacity : 0);
        seam.style.visibility = seamInRange && sp.visible ? 'visible' : 'hidden';
      }
      // Position the hit zones using the identical project() calculation as
      // the digits above. An adjacent entry outside the array has no target.
      const {stepTargets} = wheels[name][appearanceIndex];
      for (const [direction,change] of [['above',1],['below',-1]]) {
        const target = stepTargets[direction];
        const adjacentIndex = selectedIndex + change;
        const p = project(adjacentIndex - position);
        target.hidden = adjacentIndex < 0 || adjacentIndex >= values.length || !p.visible;
        target.style.setProperty('--target-y', `${p.y}px`);
      }
      if (!state.drag && !state.wheelEdit) queueLayoutFrame(() => {
        for (const item of nodes) item.style.removeProperty('transition');
        for (const seam of seamNodes) seam.style.removeProperty('transition');
      });
    }
  }

  // Values are arrays in every phase. While editing, report the selected
  // green entry and ALL permissible blue outputs, in author-defined order.
  // While pending, preserve those alternatives. After confirmation report
  // singleton arrays. Unresolved counterparts are empty arrays, not stale
  // confirmed values. Preferred IDs are metadata and never reorder outputs.
  function publishedSnapshot(displayedResults) {
    const phase = state.active ? 'preview' : state.pending ? 'pending'
      : state.unresolved ? 'unresolved' : 'committed';
    const values = Object.create(null);
    const preferredId = Object.create(null);
    for (const [name, config] of Object.entries(variables)) {
      if (Object.hasOwn(config,'fixed')) {
        values[name] = [{id:`fixed-${name}`,latex:String(config.fixed),value:config.fixed}];
        preferredId[name] = null;
        continue;
      }
      const result = displayedResults[name];
      values[name] = result ? result.options.map(entry => ({...entry}))
        : [{...selectedEntry(name)}];
      preferredId[name] = result?.preferredId ?? null;
    }
    const inputVariable=state.active || state.pending?.input || state.unresolved || inputName || null;
    return {example:exampleKey,phase,active:state.active || null,
      inputVariable,outputVariable:inputVariable ? nextName(inputVariable) : null,
      choiceBehavior:choiceBehavior(),values,preferredId};
  }

  function render(activePosition = null) {
    const displayedResults = Object.create(null);
    for (const name of variableNames) {
      const other=nextName(name);
      const determined = name===dependentName || state.active===other || (state.pending && state.pending.other===name) || (state.unresolved===other);
      const sourceName = determined ? (dependentName ? inputName : (state.active || state.pending?.input || state.unresolved)) : null;
      // Compute once per underlying variable, not once per appearance.
      const result = determined ? possibleResult(sourceName,selectedEntry(sourceName)) : null;
      if (result) displayedResults[name] = result;
      const options = result?.options ?? null;
      const prefId = options && options.length>1 ? result.preferredId : null;
      const displayFade = determined && choiceBehavior()==='automatic' && Boolean(prefId);
      const entry = !determined ? selectedEntry(name) : null;
      // No output slot means there is no visible mathematical HTML to build.
      // Keep relationship evaluation, change tracking, and subscriptions intact.
      const faceHTML = boxOmitted(name) ? '' : determined
        ? (valueConcealed(name) ? concealedValueMarkup(name) : displayValues(options,prefId,displayFade))
        : mathHTML(entry);
      // In automatic mode the author-designated branch is the actual branch
      // being followed. Required mode remains ambiguous until the student
      // selects a value and therefore suppresses the blue direction arrow.
      const blueEntry = determined ? (options.length===1 ? options[0] :
        (choiceBehavior()==='automatic' ? result.preferred : null)) : null;
      observeChange(name, determined ? 'blue' : 'green',
        determined ? blueEntry : entry,
        determined ? selectedEntry(sourceName).id : null);
      occurrences[name].forEach((slot, i) => {
        slot.classList.toggle('determined',Boolean(determined));
        slot.classList.toggle('available',!determined);
        slot.classList.toggle('awaiting',Boolean(state.pending && state.pending.other===name));
        // Rewriting identical cached MathJax SVG nodes every frame is costly.
        const faceKey = determined
          ? (valueConcealed(name) ? `blue:concealed:${variables[name].hiddenValueLabel ?? '?'}`
            : `blue:${sourceName}:${options.map(v=>v.id).join('|')}:${prefId}:${displayFade}:${presentationState.noOutputsLabel}`)
          : `green:${entry.id}:${entry.latex}`;
        const face = slot.querySelector('.value-face');
        if (face.dataset.renderKey !== faceKey) {
          face.innerHTML = faceHTML;
          face.dataset.renderKey = faceKey;
        }
        // A selected temporary expression can be wider than any canonical
        // digit. Measure the rendered SVG and expand only this green wheel.
        // Determine widths from the actual glyphs without guessing how many
        // characters, radicals, or minus signs the author used.
        if (!determined) fitGreenValueFace(name,slot,face,entry,i);
        const qualifier = occurrences[name].length > 1 ? `, appearance ${i+1} of ${occurrences[name].length}` : '';
        if (determined) {
          const pendingChoice=Boolean(state.pending && name!==dependentName);
          slot.setAttribute('role',pendingChoice ? 'button' : 'img');
          const relation = prefId ? (displayFade ? '; selected automatically: ' : '; highlighted option: ')
            + spokenValue(result.preferred) : '';
          const status = pendingChoice ? 'choose an output' : name===dependentName
            ? 'not adjustable'
            : `changes based on ${spokenName(sourceName)}`;
          slot.setAttribute('aria-label', valueConcealed(name)
            ? `${spokenName(name)}${qualifier}, ${status}; ${concealedAccessibleDescription(name)}${options.length ? '' : '; no output'}`
            : `${spokenName(name)}${qualifier}, ${status}: ${options.length?describeOptions(options):presentationState.noOutputsLabel}${relation}`);
          slot.removeAttribute('aria-valuemin'); slot.removeAttribute('aria-valuemax'); slot.removeAttribute('aria-valuenow');
          slot.removeAttribute('aria-valuetext');
          if (pendingChoice) {
            slot.setAttribute('aria-describedby',popupLabel.id);
            slot.setAttribute('aria-controls',popup.id);
          } else {
            slot.removeAttribute('aria-describedby');
            slot.removeAttribute('aria-controls');
          }
          slot.tabIndex = pendingChoice ? 0 : -1;
        } else {
          slot.setAttribute('role','spinbutton');
          slot.removeAttribute('aria-controls');
          slot.setAttribute('aria-describedby',eqId('wheel-keyboard-help'));
          slot.setAttribute('aria-label',`Choose ${spokenName(name)}${qualifier}`);
          slot.setAttribute('aria-valuemin', String(wheelView[name].min)); slot.setAttribute('aria-valuemax', String(wheelView[name].max));
          slot.setAttribute('aria-valuenow',String(entry.value));
          slot.setAttribute('aria-valuetext',spokenValue(entry));
          slot.tabIndex=0;
        }
      });
      // All repeated cylinders receive the same fractional drag position,
      // giving genuine synchronous animation rather than just text updates.
      if (name!==dependentName) paintWheel(name, name===state.active && activePosition!==null
        ? activePosition : wheelView[name].indices[state.selected[name]]);
    }
    notifyValueSubscribers(publishedSnapshot(displayedResults));
  }
  // The tray is independent of the formula's layout. Position it using the
  // blue box's actual rendered rect, which includes mobile equation scaling.
  function positionPopup() {
    if (popup.hidden || !state.pending) return;
    // A single tray always points to the first (leftmost) appearance.
    const anchor = occurrences[state.pending.other][0].getBoundingClientRect();
    const stage = equationRoot.getBoundingClientRect();
    // The tray itself scales as a unit, independently of the transformed
    // equation. Read its VISUAL width after scaling for correct boundaries.
    const popupVisualWidth = popup.getBoundingClientRect().width;
    const popupNaturalWidth = popup.offsetWidth;
    const popupScale = parseFloat(popup.dataset.equationScale) || 1;
    const targetX = anchor.left + anchor.width / 2 - stage.left;
    const margin = 9;
    const centerX = Math.max(margin + popupVisualWidth / 2,
      Math.min(stage.width - margin - popupVisualWidth / 2, targetX));
    popup.style.left = `${centerX}px`;
    // Position beneath the rendered formula, including mobile scaling.
    const formulaBottom = eqById('equation').getBoundingClientRect().bottom;
    popup.style.top = `${formulaBottom - stage.top + 15}px`;
    // --pointer-x is measured in the popup's OWN (pre-transform) pixels.
    // Converting screen distance by popupScale keeps the pointer accurate.
    const notch = popupNaturalWidth/2 + (targetX - centerX)/popupScale;
    popup.style.setProperty('--pointer-x',
      `${Math.max(12,Math.min(popupNaturalWidth - 12, notch))}px`);
  }
  // The blue box animates from green-wheel width to determined-value width.
  // ResizeObserver keeps the anchored tray aligned throughout that transition.
  // A blue box containing four alternatives can be much wider than its
  // resting wheel. Refit the formula as those widths change, especially on
  // narrow screens, before positioning the choice popup.
  const choiceObserver = new ResizeObserver(() => fitEquation());
  failureDisposers.push(()=>choiceObserver.disconnect());
  // PreTeXt can resize a slate after initial mount without firing a window
  // resize event. Observe the host as well as its changing-value boxes.
  choiceObserver.observe(equationRoot);
  // Also observe the assembled formula (operators, parentheses, static math),
  // whose natural width may change without changing any individual wheel.
  choiceObserver.observe(eqById('equation'));
  for (const slot of allSlots) choiceObserver.observe(slot);
  function fitEquation() {
    const equation = eqById('equation');
    const fittedScale = fittedEquationScale(equation);
    applyEquationScale(equation,fittedScale);
    // Preserve the popup's original size at equationScale=1, including on
    // phones where the equation has always been given a smaller baseline.
    // On narrow containers, reduce popup scale if equation fit limits it.
    const popupScale=Math.min(presentationState.equationScale,
      fittedScale/responsiveBaselineScale());
    popup.dataset.equationScale=String(popupScale);
    popup.style.transform=`translateX(-50%) scale(${popupScale})`;
    // Make its pre-transform max width small enough that scaling up cannot
    // cause a four-choice tray to extend outside the visible stage/viewport.
    const availablePopup=Math.max(60,Math.min(equationRoot.clientWidth,window.innerWidth)-18);
    popup.style.maxWidth=`${availablePopup/popupScale}px`;
    positionPopup();
    positionChangeIndicators();
  }
  window.addEventListener('resize', fitEquation, {signal:lifetime.signal});
  function hidePopup() { state.pending=null; popup.hidden=true; popupButtons.replaceChildren(); }
  function clearEditSnapshot() { state.beforeEdit=null; }

  // Version 19.4.5: a trackpad gesture and a notched mouse wheel both
  // produce WheelEvents, but their delta sizes/cadence differ dramatically.
  // Lock the input class for a gesture on its FIRST event: small pixel deltas
  // mean a smooth trackpad; large or line/page deltas mean a notched wheel.
  // Each has its own author-configurable sensitivity. This class remains fixed
  // until the 850ms idle commit; a fast trackpad flick must not suddenly
  // switch to mouse-wheel scaling halfway through its gesture.
  // For both inputs, accumulate continuous *target* distance but animate the
  // displayed cylinder toward that target on requestAnimationFrame. This
  // removes per-event visual jumps without introducing momentum or a fling:
  // there is no velocity extrapolation, only a brief visual interpolation to
  // the distance actually supplied by the input device.
  // None of this touches pointer dragging or drag autoscroll.
  const DEFAULT_WHEEL_PIXELS_PER_STEP = 90; // mouse, typically one notch/entry
  const DEFAULT_TRACKPAD_PIXELS_PER_STEP = 40; // continuous two-finger gesture
  const TRACKPAD_EVENT_MAX_PIXELS = 45;
  const WHEEL_FOLLOW_TIME_MS = 65; // visual response time, not a selection timer
  const WHEEL_LINE_HEIGHT_PX = 30;
  const WHEEL_SETTLE_MS = 850; // unchanged
  let wheelSettleTimer = null;
  let wheelScrollPosition = null; // currently rendered fractional array position
  let wheelTargetPosition = null; // cumulative, clamped input distance
  let wheelInputKind = null; // 'trackpad' or 'mouse', stable per gesture
  let wheelAnimationFrame = null;
  let wheelLastFrameTime = null;
  let wheelChangedEntry = false;
  let wheelResumedPending = false;
  function stopWheelAnimation() {
    if (wheelAnimationFrame !== null) cancelAnimationFrame(wheelAnimationFrame);
    wheelAnimationFrame = null;
    wheelLastFrameTime = null;
  }
  // The pointer's first screen position distinguishes a genuine stationary
  // scroll through a moving equation from deliberately moving to a blue box.
  // Keep the anchor for one wheel gesture; never infer it from the new box.
  let wheelPointerOrigin = null;
  const BLUE_CONTINUATION_TOLERANCE_PX = 14;
  function resetWheelAccumulation() {
    stopWheelAnimation();
    wheelScrollPosition = null;
    wheelTargetPosition = null;
    wheelInputKind = null;
    wheelChangedEntry = false;
    wheelResumedPending = false;
    wheelPointerOrigin = null;
  }
  function wheelDeltaInPixels(event) {
    if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE_HEIGHT_PX;
    if (event.deltaMode === 2) return event.deltaY * Math.max(300, window.innerHeight * .8);
    return event.deltaY;
  }
  function wheelKindForFirstEvent(e) {
    return e.deltaMode === 0 && Math.abs(e.deltaY) < TRACKPAD_EVENT_MAX_PIXELS
      ? 'trackpad' : 'mouse';
  }
  function advanceWheelAnimation(timestamp) {
    wheelAnimationFrame = null;
    const name = state.wheelEdit;
    if (destroyed || !name || wheelTargetPosition===null) return;
    // Limit large timestamp gaps if a background tab / slow renderer resumes.
    const dt = wheelLastFrameTime===null ? 16.7
      : Math.min(64, Math.max(1, timestamp-wheelLastFrameTime));
    wheelLastFrameTime = timestamp;
    // Wheel/trackpad editing remains usable with reduced motion, but skips
    // the optional easing trail. Keyboard and pointer inputs are unchanged.
    const remaining = wheelTargetPosition-wheelScrollPosition;
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const factor = reducedMotion ? 1 : 1-Math.exp(-dt/WHEEL_FOLLOW_TIME_MS);
    wheelScrollPosition = reducedMotion || Math.abs(remaining) < .002
      ? wheelTargetPosition : wheelScrollPosition + remaining*factor;
    const previousId = state.selected[name];
    setActiveIndex(Math.round(wheelScrollPosition),wheelScrollPosition);
    if (state.selected[name] !== previousId) wheelChangedEntry = true;
    if (wheelScrollPosition !== wheelTargetPosition)
      wheelAnimationFrame=requestAnimationFrame(advanceWheelAnimation);
    else wheelLastFrameTime=null;
  }
  function ensureWheelAnimation() {
    if (wheelAnimationFrame === null)
      wheelAnimationFrame=requestAnimationFrame(advanceWheelAnimation);
  }
  function clearWheelSettleTimer() {
    if (wheelSettleTimer !== null) clearTimeout(wheelSettleTimer);
    wheelSettleTimer = null;
  }
  function scheduleWheelCommit() {
    clearWheelSettleTimer();
    wheelSettleTimer = setTimeout(() => {
      wheelSettleTimer = null;
      if (destroyed || !state.wheelEdit || state.drag) return;
      // Settle exactly at the supplied input position, never let a delayed
      // animation frame alter a choice after the gesture has committed.
      if (wheelTargetPosition !== null) {
        const name=state.wheelEdit;
        const previousId=state.selected[name];
        wheelScrollPosition=wheelTargetPosition;
        setActiveIndex(Math.round(wheelScrollPosition),wheelScrollPosition);
        if (state.selected[name] !== previousId) wheelChangedEntry=true;
      }
      if (!wheelChangedEntry && !wheelResumedPending) cancelEdit();
      else finish();
    }, WHEEL_SETTLE_MS);
  }

  function begin(name, mode='pointer') {
    if (state.active || (state.pending && state.pending.input !== name)) return false;
    claimInputOwner(interactionOwner);
    if (state.pending) {
      // A branch-choice popup is only an offer, not a modal decision.
      // Resuming the SAME green variable hides the popup, keeps its current
      // input value, and leaves the blue preview intact. Importantly, DO NOT
      // take a new snapshot: Escape must reach the last confirmed pair,
      // including any temporary-value provenance, across many resumptions.
      const popupHadFocus = popup.contains(document.activeElement);
      hidePopup();
      clearWheelSettleTimer();
      state.unresolved = null;
      state.active = name;
      state.keyboardEdit = mode==='keyboard' ? name : null;
      state.wheelEdit = mode==='wheel' ? name : null;
      for (const slot of occurrences[name])
        slot.classList.add(mode==='keyboard' ? 'keyboard-editing' : 'dragging');
      render();
      // If keyboard confirmation focused a popup button, don't leave focus
      // on a removed element after scrolling/dragging resumes.
      if (popupHadFocus) slots[name].focus({preventScroll:true});
      return true;
    }
    // Snapshot *before* clearing unresolved. Escape must restore even a
    // previously impossible selection, not silently choose a new branch.
    state.beforeEdit={
      selected:{...state.selected}, unresolved:state.unresolved,
      temporary:{...state.temporary}
    };
    state.active=name; state.unresolved=null;
    state.keyboardEdit=mode==='keyboard' ? name : null;
    state.wheelEdit=mode==='wheel' ? name : null;
    for (const slot of occurrences[name])
      slot.classList.add(mode==='keyboard' ? 'keyboard-editing' : 'dragging');
    render(); return true;
  }
  function cancelEdit() {
    clearWheelSettleTimer();
    resetWheelAccumulation();
    const before=state.beforeEdit;
    if (!before) return;
    state.selected={...before.selected};
    state.unresolved=before.unresolved;
    state.temporary={...before.temporary};
    variableNames.forEach(rebuildWheelView);
    resetChangeIndicators();
    stopAutoScroll();
    state.active=null; state.drag=null; state.keyboardEdit=null; state.wheelEdit=null;
    for (const slot of allSlots)
      slot.classList.remove('dragging','keyboard-editing');
    hidePopup(); clearEditSnapshot(); render();
    announce('Change canceled. Previous values restored.');
    releaseInputOwner(interactionOwner);
  }
  function setActiveIndex(index,position=index) {
    if (!state.active) return;
    const values = wheelView[state.active].values;
    state.selected[state.active] = values[Math.max(0,Math.min(values.length-1,index))].id;
    render(position);
  }

  // Version 18.3: drag autoscroll is on for EVERY wheel by default.
  // An author can disable it on a particular variable with dragAutoScroll:false.
  // Distances below refer to unscaled equation pixels,
  // so the activation region follows the visible cylinder on mobile too.
  // A stationary pointer beyond the threshold continues rotating the wheel.
  // Re-centering stops the animation, retaining the accumulated position.
  const AUTO_SCROLL = {
    threshold:105,              // Just outside the wheel's 98px cylinder radius
    stepsPerSecondPerPixel:0.20, // Gradually faster the farther the pointer moves
    maxStepsPerSecond:28         // Cap speed so distant values remain controllable
  };
  let autoScrollFrame = null;
  function stopAutoScroll() {
    if (autoScrollFrame !== null) cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = null;
    if (state.drag) state.drag.lastAutoFrame = null;
  }
  function autoscrollSpeed(drag) {
    if (variables[drag.name].dragAutoScroll === false) return 0;
    const offset = (drag.y - drag.currentY) / drag.scale;
    const excess = Math.abs(offset) - AUTO_SCROLL.threshold;
    if (excess <= 0) return 0;
    return Math.sign(offset) * Math.min(
      AUTO_SCROLL.maxStepsPerSecond,
      excess * AUTO_SCROLL.stepsPerSecondPerPixel
    );
  }
  function updateDragPosition(drag) {
    if (state.drag !== drag || state.active !== drag.name) return;
    const values = wheelView[drag.name].values;
    const perStep = variables[drag.name].pixelsPerStep ?? 85;
    const directSteps = (drag.y - drag.currentY) / (drag.scale * perStep);
    const requested = drag.start + directSteps + drag.autoSteps;
    const position = Math.max(0, Math.min(values.length - 1, requested));
    // Prevent accumulated autoscroll from winding up against an endpoint:
    // moving back from an endpoint must respond immediately.
    if (requested !== position) drag.autoSteps += position - requested;
    drag.position = position;
    setActiveIndex(Math.round(position), position);
  }
  function advanceAutoScroll(timestamp) {
    autoScrollFrame = null;
    const drag = state.drag;
    if (!drag) return;
    const speed = autoscrollSpeed(drag);
    if (!speed) { drag.lastAutoFrame = null; return; }
    if (drag.lastAutoFrame !== null) {
      // Bound elapsed time after tab suspension so a hidden tab cannot produce
      // an unexpected large jump when it becomes visible again.
      const seconds = Math.min(0.05, Math.max(0, timestamp - drag.lastAutoFrame) / 1000);
      drag.autoSteps += speed * seconds;
      updateDragPosition(drag);
    }
    drag.lastAutoFrame = timestamp;
    autoScrollFrame = requestAnimationFrame(advanceAutoScroll);
  }
  function updateAutoScrollStatus(drag) {
    if (!autoscrollSpeed(drag)) {
      stopAutoScroll();
    } else if (autoScrollFrame === null) {
      drag.lastAutoFrame = null;
      autoScrollFrame = requestAnimationFrame(advanceAutoScroll);
    }
  }

  function finish() {
    clearWheelSettleTimer();
    resetWheelAccumulation();
    if (!state.active) return;
    const input=state.active, other=nextName(input);
    const fromKeyboard = state.keyboardEdit===input;
    for (const slot of occurrences[input]) slot.classList.remove('dragging','keyboard-editing');
    state.keyboardEdit=null;
    state.wheelEdit=null;
    const chosen = selectedEntry(input);
    const result = possibleResult(input,chosen);
    const {options,preferred,preferredId} = result;
    // A slow keyboard edit may outlast the visual arrow's fade timer, and
    // authors can disable visual indicators. Preserve an accurate spoken
    // direction from the last confirmed input to this newly confirmed input.
    let committedDirection = null;
    if (valueConcealed(other) && options.length===1) {
      const oldId=state.beforeEdit?.selected?.[input];
      const oldInput=oldId === undefined ? null : wheelView[input].byId[oldId];
      if (oldInput) {
        const oldOptions=possibleResult(input,oldInput).options;
        if (oldOptions.length===1) {
          const before=oldOptions[0].value, after=options[0].value;
          committedDirection=before===after ? 'unchanged' :
            after>before ? 'increasing' : 'decreasing';
        }
      }
    }
    state.active=null;
    // Retain a temporary wheel entry while dragging, including on returning
    // to it; discard it ONLY after the manipulation ends on another entry.
    if (state.temporary[input] && state.temporary[input].entry.id !== chosen.id)
      setTemporary(input,null);
    if(options.length===0) {
      state.unresolved=input; hidePopup(); clearEditSnapshot(); render();
      announceResult(input,chosen,other,result,committedDirection);
      releaseInputOwner(interactionOwner);
      return;
    }
    // A permanent blue quantity has no selected wheel entry to update.
    // Its blue face and subscription are always computed from the input.
    if (other===dependentName) {
      state.unresolved=null; hidePopup(); clearEditSnapshot(); render();
      announceResult(input,chosen,other,result,committedDirection);
      releaseInputOwner(interactionOwner);
      return;
    }
    // A unique output or an author-designated automatic branch commits without
    // a popup. If the author supplies no valid preferredId, even automatic
    // mode falls back to required rather than silently choosing the first.
    if(options.length===1 || (choiceBehavior()==='automatic' && preferred)) {
      selectOutput(other,options.length===1 ? options[0] : preferred,input,chosen);
      state.unresolved=null; hidePopup(); clearEditSnapshot(); render();
      announceResult(input,chosen,other,result,committedDirection);
      releaseInputOwner(interactionOwner);
      return;
    }
    state.unresolved=null;
    state.pending={ input, other, options, preferredId };
    render();
    populatePendingButtons();
    popup.hidden=false;

    queueLayoutFrame(fitEquation);
    // The branch choices must be reachable immediately after Enter.
    // Keyboard focus already announces the first option; announce the prompt
    // only for pointer/wheel users, to avoid duplicating it for keyboard users.
    if (fromKeyboard) popupButtons.querySelector('button').focus({preventScroll:true});
    else announce(`Choose a value for ${spokenName(other)}. ${options.length} choices available.`);
  }

  // Release is the sole normal completion signal for a pointer gesture,
  // whether the browser retained capture or we tracked movement on document.
  // A click on a projected neighboring value steps once; movement cancels the
  // tap behavior and turns it into an ordinary continuous drag.
  function commitPointerDrag(pointerId) {
    const drag=state.drag;
    if (!drag || drag.id!==pointerId) return;
    stopAutoScroll();
    if (drag.tapStep && !drag.moved) {
      const index=wheelView[drag.name].indices[state.selected[drag.name]];
      setActiveIndex(Math.max(0,Math.min(wheelView[drag.name].values.length-1,index+drag.tapStep)));
    }
    state.drag=null;
    finish();
  }

  for (const name of wheelNames) {
    for (const element of occurrences[name]) {
    element.addEventListener('focusout', e => {
      // Tab or click away cancels an unfinished keyboard/wheel preview.
      if ((state.keyboardEdit===name || state.wheelEdit===name) &&
          !element.contains(e.relatedTarget)) cancelEdit();
    },{signal:lifetime.signal});
    element.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse' && e.button!==0) return;
      if(state.pending && state.pending.input!==name) return;
      if(state.keyboardEdit) cancelEdit();
      // A pointer press during wheel scrolling can continue the SAME editing
      // gesture as a normal drag. Moving to a different variable cancels the
      // unfinished wheel preview rather than opening an unexpected popup.
      let continuingWheel = false;
      if (state.wheelEdit) {
        continuingWheel = state.wheelEdit === name;
        clearWheelSettleTimer();
        resetWheelAccumulation();
        if (continuingWheel) state.wheelEdit = null;
        else cancelEdit();
      }
      if(state.active && !continuingWheel) return;
      if(element.classList.contains('determined')) return;
      const target=e.target.closest('.step-target');
      const tapStep=target && element.contains(target)
        ? Number(target.dataset.stepChange) : 0;
      if(!continuingWheel && !begin(name)) return;
      claimInputOwner(interactionOwner);
      state.drag={name,slotId:element.id,id:e.pointerId,
        x:e.clientX,y:e.clientY,currentY:e.clientY,
        moved:false,tapStep,
        scale:element.getBoundingClientRect().height/element.offsetHeight,
        start:wheelView[name].indices[state.selected[name]],
        position:wheelView[name].indices[state.selected[name]],
        autoSteps:0,lastAutoFrame:null};
      // Pointer capture improves out-of-box dragging, but isn't necessary:
      // document listeners below continue tracking if capture is unsupported,
      // rejected, or lost. Safari/WebKit can differ in capture lifecycle.
      try { element.setPointerCapture(e.pointerId); } catch (_) { /* document fallback */ }
      element.focus({preventScroll:true});
      e.preventDefault();
    },{signal:lifetime.signal});
    function endDrag(e) {
      if(!state.drag || state.drag.slotId!==element.id) return;
      commitPointerDrag(e.pointerId);
    }
    function abortDrag(e) {
      if(state.drag && state.drag.slotId===element.id && state.drag.id===e.pointerId)
        cancelEdit();
    }
    element.addEventListener('pointerup',endDrag,{signal:lifetime.signal});
    element.addEventListener('pointercancel',abortDrag,{signal:lifetime.signal});
    // Losing capture is NOT a pointer cancellation. It is common when the
    // hit-target DOM changes, or in browsers with different capture semantics.
    // Keep tracking until pointerup on document or an actual pointercancel.
    element.addEventListener('keydown',e=>{
      if(state.drag || (state.pending && state.pending.input!==name)) return;
      if(e.key==='Escape' && (state.pending?.input===name || state.keyboardEdit===name || state.wheelEdit===name)) {
        e.preventDefault(); cancelEdit(); return;
      }
      if(e.key==='Tab') {
        // Do not trap Tab. Restore the confirmed values before native focus
        // traversal, so the blue wheel is tabbable again.
        if(state.keyboardEdit===name || state.wheelEdit===name) cancelEdit();
        return;
      }
      if(e.key==='Enter') {
        // Enter already confirmed this green input when the prompt appeared;
        // arrow keys (not Enter) resume exploration from a pending prompt.
        if (state.pending) return;
        e.preventDefault();
        if (state.wheelEdit===name || state.keyboardEdit===name)
          claimInputOwner(interactionOwner);
        if(state.wheelEdit===name) { finish(); return; }
        if(!state.active) begin(name,'keyboard'); // Reselect current branch.
        if(state.keyboardEdit===name) finish();
        return;
      }
      const index=wheelView[name].indices[state.selected[name]];
      let next=null;
      if(e.key==='ArrowUp') next=index+1;
      else if(e.key==='ArrowDown') next=index-1;
      // Page Up/Down are the WAI-ARIA spinbutton convention for coarse
      // navigation; step in ARRAY entries, not numerical distance.
      else if(e.key==='PageUp') next=index+(variables[name].pageStep ?? 10);
      else if(e.key==='PageDown') next=index-(variables[name].pageStep ?? 10);
      else if(e.key==='Home') next=0;
      else if(e.key==='End') next=wheelView[name].values.length-1;
      if(next!==null) {
        e.preventDefault();
        if(state.wheelEdit===name || state.keyboardEdit===name)
          claimInputOwner(interactionOwner);
        if(state.wheelEdit===name) {
          // Arrow keys can take over an in-progress wheel preview without
          // confirming it; Enter remains the explicit keyboard confirmation.
          clearWheelSettleTimer();
          resetWheelAccumulation();
          state.wheelEdit=null;
          state.keyboardEdit=name;
          for (const slot of occurrences[name]) {
            slot.classList.remove('dragging');
            slot.classList.add('keyboard-editing');
          }
        }
        if(!state.active) begin(name,'keyboard');
        if(state.keyboardEdit===name)
          setActiveIndex(Math.max(0,Math.min(wheelView[name].values.length-1,next)));
      }
    },{signal:lifetime.signal});
    // WheelEvents are handled ONCE by the delegated listener below. A
    // stationary trackpad pointer may otherwise stop targeting this element
    // when the blue box expands and the equation shifts horizontally.
    }
  }

  // Delegated capture-phase wheel handler. While an active wheel gesture is
  // in progress, route scroll events anywhere over the mathematical equation
  // back to the SAME green variable, even if its box has moved away from the
  // stationary cursor because the blue box expanded. This does not make blue
  // boxes manipulable: it merely keeps the existing green-wheel gesture alive.
  // Scrolls elsewhere on the page retain their normal browser behavior.
  document.addEventListener('wheel',e=>{
    const equation=eqById('equation');
    const target=e.target instanceof Element ? e.target : e.target?.parentElement;
    let name;
    if (state.wheelEdit) {
      if (!target || !equation.contains(target)) return;
      // A blue box may come underneath the SAME stationary pointer when
      // determined values resize the equation. That must not interrupt the
      // gesture begun on green. But after the pointer MOVES onto a blue box,
      // wheel input must not continue controlling the original green wheel.
      const blueSlot=target.closest('.slot.determined[data-variable]');
      if (blueSlot && equation.contains(blueSlot) &&
          (!wheelPointerOrigin || Math.hypot(
            e.clientX-wheelPointerOrigin.x,
            e.clientY-wheelPointerOrigin.y) > BLUE_CONTINUATION_TOLERANCE_PX)) return;
      name=state.wheelEdit;
    } else {
      const slot=target?.closest('.slot.available[data-variable]');
      if (!slot || !equation.contains(slot) || slot.classList.contains('determined')) return;
      name=slot.dataset.variable;
    }
    if (state.drag || (state.pending && state.pending.input!==name)) return;
    const deltaPixels=wheelDeltaInPixels(e);
    if (!Number.isFinite(deltaPixels) || deltaPixels===0) return;
    if (state.active && state.wheelEdit!==name) return;
    e.preventDefault();
    if(state.keyboardEdit) cancelEdit();
    if(!state.wheelEdit) {
      const wasPending=Boolean(state.pending && state.pending.input===name);
      if(!begin(name,'wheel')) return;
      wheelResumedPending=wasPending;
      wheelChangedEntry=false;
      wheelScrollPosition=wheelView[name].indices[state.selected[name]];
      wheelTargetPosition=wheelScrollPosition;
      wheelInputKind=wheelKindForFirstEvent(e);
      wheelPointerOrigin={x:e.clientX,y:e.clientY};
    }
    // Reclaim ownership on EVERY accepted wheel event, including a resumption
    // of a gesture that started before another equation's gesture.
    claimInputOwner(interactionOwner);
    const view=wheelView[name];
    const config=variables[name];
    const speed=wheelInputKind==='trackpad'
      ? (config.trackpadPixelsPerStep ?? DEFAULT_TRACKPAD_PIXELS_PER_STEP)
      : (config.wheelPixelsPerStep ?? DEFAULT_WHEEL_PIXELS_PER_STEP);
    if(!Number.isFinite(speed) || speed<=0)
      throw new RangeError(`Scroll pixels per step must be positive for ${name}`);
    // No overscroll debt: reversing direction at an endpoint responds now.
    wheelTargetPosition=Math.max(0,Math.min(view.values.length-1,
      wheelTargetPosition-deltaPixels/speed));
    ensureWheelAnimation();
    scheduleWheelCommit();
  },{capture:true,passive:false,signal:lifetime.signal});

  // Pointer capture is still requested above, but tracking at document level
  // also works outside the wheel if capture is unavailable or retargeted.
  document.addEventListener('pointermove', e => {
    const drag = state.drag;
    if (!drag || drag.id !== e.pointerId) return;
    if (Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6) drag.moved=true;
    drag.currentY = e.clientY;
    updateDragPosition(drag);
    updateAutoScrollStatus(drag);
  }, {signal:lifetime.signal});
  // With successful capture the box listener clears state.drag first. When
  // capture was lost, document-level pointerup still commits normally.
  document.addEventListener('pointerup', e => {
    commitPointerDrag(e.pointerId);
  }, {signal:lifetime.signal});
  document.addEventListener('pointercancel', e => {
    if (state.drag && state.drag.id === e.pointerId) cancelEdit();
  }, {signal:lifetime.signal});
  // If a mouse is released outside the browser while capture is unavailable,
  // leaving the window should never strand the wheel in its dragging state.
  window.addEventListener('blur', () => {
    if (state.drag) cancelEdit();
  }, {signal:lifetime.signal});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.drag) cancelEdit();
  }, {signal:lifetime.signal});

  // Escape restores the LAST confirmed pair even after several resumptions.
  // Handle it at document level, too: wheel/trackpad gestures need not focus
  // the green box or popup, so Escape must work from either focus location.
  // Focus may be in a popup choice, a green slot, or elsewhere on the page.
  document.addEventListener('keydown', e => {
    if (e.key!=='Escape' || (!state.pending && !state.active) || e.defaultPrevented) return;
    const target = e.target instanceof Element ? e.target : e.target?.parentElement;
    const focusedStage = target?.closest('[data-slate="equation"]');
    const focusedOwner=focusedStage && ownersByRoot.get(focusedStage);
    const escapeOwner=focusedOwner && activeInputOwners.has(focusedOwner)
      ? focusedOwner : lastInteractionOwner;
    if (escapeOwner !== interactionOwner) return;
    e.preventDefault();
    const input=state.pending?.input || state.active;
    cancelEdit();
    slots[input].focus({preventScroll:true});
  }, {signal:lifetime.signal});

  // These resources are normally owned by destroy(); on a thrown initial
  // render, they must be stopped even though no instance was returned.
  failureDisposers.push(()=>{
    resetChangeIndicators();
    stopAutoScroll();
    clearWheelSettleTimer();
    resetWheelAccumulation();
  });
  measureDeterminedWidths();
  render();
  fitEquation();
  // Presentation changes are delivered to this particular instance, never
  // through a global window event shared with unrelated equations.
  function setPresentation(options) {
    if (destroyed) return;
    for (const key of ['showVariableTabs','showVariableNamesInText','showChangeIndicators']) {
      if (Object.hasOwn(options,key)) presentationState[key]=Boolean(options[key]);
    }
    // Only the no-output placeholder changes the content used by the
    // blue-box width measurement. Tab/indicator/text visibility and overall
    // equation scaling do not change those intrinsic widths.
    const previousNoOutputsLabel = presentationState.noOutputsLabel;
    if (Object.hasOwn(options,'noOutputsLabel'))
      presentationState.noOutputsLabel=validateNoOutputsLabel(options.noOutputsLabel);
    if (Object.hasOwn(options,'equationScale'))
      presentationState.equationScale=validateEquationScale(options.equationScale);
    applyPresentationOptions();
    if (presentationState.noOutputsLabel !== previousNoOutputsLabel)
      measureDeterminedWidths();
    render();
    queueLayoutFrame(() => { fitEquation(); positionPopup(); });
  }
  // Re-measure if a webfont loads after the first layout pass.
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      if (!destroyed) {
        greenMathWidthCache.clear();
        measureDeterminedWidths();
        render();
        fitEquation();
      }
    });
  }
  // Expose state and the fixed DOM pool size for author/browser testing.
  const debug = {
    get state() {
      return {
        ...state.selected, active: state.active,
        pending: state.pending && {...state.pending},
        unresolved: state.unresolved,
        drag: state.drag && {...state.drag},
        keyboardEdit: state.keyboardEdit,
        wheelEdit: state.wheelEdit,
        temporary: Object.fromEntries(variableNames.map(name => [name,
          state.temporary[name] && {
            entry: {...state.temporary[name].entry},
            fromVariable: state.temporary[name].fromVariable,
            fromEntry: {...state.temporary[name].fromEntry}
          }
        ]))
      };
    },
    variables, permissibleOutputs, numberEntry, exampleKey,
    get choiceBehavior() { return choiceBehavior(); },
    possibleResult,
    get changeIndicators() {
      return Object.fromEntries(variableNames.map(name => [name, {
        order:orderFor(name), enabled:Boolean(variables[name].showChangeIndicator),
        direction:changeTracker[name].direction,
        text:changeIndicators[name]?.[0]?.innerText || '',
        visible:changeIndicators[name]?.some(indicator=>indicator.classList.contains('visible')) || false,
        appearanceCount:changeIndicators[name]?.length ?? 0
      }]));
    },
    wheelPoolSize: POOL_SIZE,
    get wheelNodeCounts() {
      // Preserve the V17 per-wheel shape for consumers using the first
      // appearance, and additionally expose full repeated-appearance counts.
      return Object.fromEntries(variableNames.map(name => [name, {
        numbers: wheels[name]?.[0]?.nodes.length ?? 0, seams: seams[name]?.[0]?.length ?? 0,
        selectableValues: valuesFor(name).length,
        displayedValues: name===dependentName ? 0 : wheelView[name].values.length
      }]));
    },
    get appearanceCounts() {
      return Object.fromEntries(variableNames.map(name => [name, occurrences[name].length]));
    },
    get mathJaxCacheSize() { return texHTMLCache.size; },
    get mathJaxConversionCount() { return mathJaxConversions; },
    get speechDiagnostics() { return [...speechDiagnostics.values()].map(item=>({...item})); },
    get wheelAppearanceNodeCounts() {
      return Object.fromEntries(variableNames.map(name => [name,
        (wheels[name] || []).map((wheel,i) => ({
          id: wheel.slot.id, numbers: wheel.nodes.length, seams: seams[name][i].length
        }))
      ]));
    }
  };

  // Explicit instance lifecycle: mounting the next demonstration equation
  // disposes of this one. Its snapshots, subscriptions, and gestures are owned
  // exclusively by this object, not by the application or the author catalogue.
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    mountedFormulaHosts.delete(equationRoot);
    // Capture may outlive a pointerup on some touch/Safari paths. Disconnect
    // it before removing the wheel nodes; no callbacks should survive abort.
    if (state.drag) {
      const pressed=allSlots.find(slot=>slot.id===state.drag.slotId);
      try {
        if (pressed?.hasPointerCapture(state.drag.id))
          pressed.releasePointerCapture(state.drag.id);
      } catch (_) { /* Safe if capture was already lost. */ }
    }
    releaseInputOwner(interactionOwner);
    ownersByRoot.delete(equationRoot);
    lifetime.abort();
    choiceObserver.disconnect();
    cancelLayoutFrames();
    resetChangeIndicators();
    for (const indicators of Object.values(changeIndicators))
      for (const indicator of indicators) indicator.remove();
    stopAutoScroll();
    clearWheelSettleTimer();
    resetWheelAccumulation();
    state.drag = null;
    state.active = null;
    state.pending = null;
    state.keyboardEdit = null;
    state.wheelEdit = null;
    state.beforeEdit = null;
    popup.hidden = true;
    popupButtons.replaceChildren();
    for (const key of ['left','top','maxWidth','transform']) popup.style.removeProperty(key);
    popup.style.removeProperty('--pointer-x');
    delete popup.dataset.equationScale;
    // Remove the rendered formula (and its former input targets) while
    // preserving the pre-namespaced host scaffold for a subsequent mount.
    eqById('equation').replaceChildren();
    accessibleMath?.remove();
    resetEquationScale(eqById('equation'));
    equationRoot.classList.remove('labels-hidden','prompt-names-hidden',
      'indicators-hidden','linear-demo','fraction-demo','fraction-reversed',
      'multi-demo');
    restoreHostAriaLabel();
    if (ownsGroupRole) equationRoot.removeAttribute('role');
    announcement.remove();
    // Remove only the scaffold nodes created by this instance. In particular,
    // preserve author-provided popup/help elements for later remounts.
    for (const element of createdScaffoldNodes.reverse()) element.remove();
    if (!hadSlateAttribute) equationRoot.removeAttribute('data-slate');
    // An originally empty host needs no persistent generated ID prefix.
    // Existing scaffolds keep their namespaced IDs across mounts.
    if (originallyEmpty && !hadPrefixAttribute)
      equationRoot.removeAttribute('data-dom-prefix');
    valueSubscribers.clear();
    latestValueSnapshot=null;
    latestSnapshotFingerprint=null;
    texHTMLCache.clear();
    greenMathWidthCache.clear();
    speechDiagnostics.clear();
  }
  const instance=Object.freeze({
    getValues: () => destroyed ? null : copySnapshot(latestValueSnapshot),
    subscribe(callback) {
      if (destroyed) throw new Error('Cannot subscribe to a destroyed equation');
      if (typeof callback !== 'function') throw new TypeError('subscribe() requires a function');
      valueSubscribers.add(callback);
      if (latestValueSnapshot!==null) {
        try {callback(copySnapshot(latestValueSnapshot));}
        catch(error){console.error('formulaWheels subscriber failed',error);}
      }
      return () => valueSubscribers.delete(callback);
    },
    setPresentation,
    destroy,
    get debug() {return debug;}
  });
  return instance;
    } catch (error) {
      // Release anything registered before the failing author callback,
      // then put back the host's original DOM and accessibility attributes.
      // Rollback failures must not hide the original authoring error.
      for (const dispose of failureDisposers.reverse()) {
        try { dispose(); }
        catch (cleanupError) { console.error('Formula Wheels initialization cleanup failed',cleanupError); }
      }
      try { restoreOriginalHost(); }
      catch (cleanupError) { console.error('Formula Wheels host rollback failed',cleanupError); }
      mountedFormulaHosts.delete(container);
      throw error;
    }
  }

  /* Experimental MathJax 4 CHTML adapter: reuse existing font processor; register official Safe filters
     before any author-supplied mathematics is converted. Public
     createFormulaWheelsAsync() handles this automatically; the legacy
     synchronous createFormulaWheels() remains unchanged for existing users. */
  const FWMath = (() => {
    let preparedDocument = null;
    let preparedJax = null;
    let preparedInputs = new Set();
    let lastPreparation = null;
    const safeTasks = new WeakMap();
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function ready() {
      for (let tries=0; tries<200; tries++) {
        const mj = window.MathJax;
        if (window.runestoneMathReady) {
          const value = await window.runestoneMathReady;
          if (!value) throw new Error('PreTeXt MathJax failed to initialize');
          await value.startup.promise;
          return value;
        }
        if (mj?.startup?.promise && mj?.startup?.document) {
          await mj.startup.promise;
          return mj;
        }
        await delay(50);
      }
      throw new Error('MathJax is not ready for Formula Wheels');
    }
    // Experimental CommonHTML branch: reuse the renderer PreTeXt has ALREADY
    // initialized. Never load output/svg or replace the document outputJax.
    function ensureCommonHTML(mj) {
      const doc = mj.startup.document;
      if (doc.outputJax?.name !== 'CHTML')
        throw new Error('CommonHTML experiment requires an existing MathJax CHTML renderer; got '+
          String(doc.outputJax?.name || 'none'));
      return doc;
    }
    // Manual conversions can occur before PreTeXt has displayed ordinary
    // mathematical content. CommonHTML output needs its generated stylesheet.
    function ensureCommonHTMLStylesheet(mj) {
      if (typeof mj.chtmlStylesheet !== 'function')
        throw new Error('CommonHTML experiment: MathJax.chtmlStylesheet() unavailable');
      // MathJax CHTML uses adaptive CSS. A PreTeXt stylesheet can already
      // exist but lack layout rules for fractions, radicals, or newly used
      // glyphs. Calling chtmlStylesheet() after prewarming adds those rules
      // incrementally to its existing style node. Do not skip this call.
      const sheet = mj.chtmlStylesheet();
      if (!sheet || sheet.tagName?.toUpperCase() !== 'STYLE')
        throw new Error('CommonHTML experiment: missing CommonHTML style node');
      const existing = document.getElementById('MJX-CHTML-styles');
      if (existing) {
        if (existing !== sheet)
          throw new Error('CommonHTML experiment: active MathJax stylesheet differs from the page stylesheet');
        return 'refreshed';
      }
      document.head.appendChild(sheet);
      return 'installed';
    }
    // MathJax 4 ui/safe normally wraps NEW MathDocument instances when loaded.
    // PreTeXt has already constructed its document, so install the upstream
    // Safe sanitizer on the EXISTING input jax, before our first conversion.
    // This follows SafeMathDocumentMixin in MathJax 4.1.3. Do not duplicate
    // its filters or allow an insecure pre-existing policy to pass silently.
    async function ensureSafe(mj, doc) {
      if (doc.safe) {
        const allow = doc.safe.allow;
        const protocols = doc.safe.options?.safeProtocols;
        if (!allow || !protocols ||
            ['URLs','styles','classes','cssIDs'].some(key=>allow[key]!=='safe') ||
            protocols.javascript!==false || protocols.data!==false)
          throw new Error('Formula Wheels: active MathJax Safe policy is not sufficiently restrictive');
        return {active:true, alreadyInstalled:true};
      }
      if (safeTasks.has(doc)) return safeTasks.get(doc);
      const task=(async()=>{
        if (!mj.loader?.load) throw new Error('MathJax 4 ui/safe loader is unavailable');
        await mj.loader.load('ui/safe');
        const Safe = mj._?.ui?.safe?.safe?.Safe;
        if (typeof Safe !== 'function' || !Safe.OPTIONS?.allow)
          throw new Error('Formula Wheels: MathJax 4 Safe class unavailable');
        const policy = {
          ...Safe.OPTIONS,
          allow: {...Safe.OPTIONS.allow, URLs:'safe', classes:'safe', cssIDs:'safe', styles:'safe'},
          safeProtocols: {...Safe.OPTIONS.safeProtocols,
            http:true, https:true, file:true, javascript:false, data:false}
        };
        const safe=new Safe(doc,policy);
        const registered=[];
        for (const jax of doc.inputJax || []) {
          if (/MathML/.test(jax.name) && jax.mathml) {
            jax.mathml.filterAttribute=safe.mmlAttribute.bind(safe);
            jax.mathml.filterClassList=safe.mmlClassList.bind(safe);
            registered.push('MathML');
          } else if (/TeX/.test(jax.name)) {
            if (!jax.postFilters?.add || !jax.parseOptions)
              throw new Error('MathJax TeX input jax cannot register Safe post-filter');
            jax.postFilters.add(data=>{
              data.math.root=jax.parseOptions.root;
              safe.sanitize(data.math,data.document);
            },-5.5);
            registered.push('TeX');
          }
        }
        if (!registered.includes('TeX'))
          throw new Error('Formula Wheels: missing TeX input jax for Safe filtering');
        doc.safe=safe;
        return {active:true,alreadyInstalled:false,inputJax:registered};
      })();
      safeTasks.set(doc,task);
      try {return await task;}
      catch(error) {safeTasks.delete(doc);throw error;}
    }
    function configuredLatex(configuration) {
      const strings=new Set();
      if (!configuration?.variables) return strings;
      const specs=configuration.variables;
      const concealedDependent=Object.values(specs).some(spec=>
        spec.strictlyDependent===true &&
        (spec.valueDisplay==='hidden' || spec.boxDisplay==='hidden'));
      for (const spec of Object.values(specs)) {
        if (typeof spec.latex==='string' && spec.latex) strings.add(spec.latex);
        if (spec.fixed!==undefined) strings.add(String(spec.fixed));
        if (spec.strictlyDependent===true) continue;
        for (const entry of (spec.values || []))
          if (typeof entry.latex==='string') strings.add(entry.latex);
      }
      if (typeof configuration.permissibleOutputs==='function') {
        for (const [name,spec] of Object.entries(specs)) {
          if (!Array.isArray(spec.values) || spec.strictlyDependent===true) continue;
          for (const entry of spec.values) {
            // Call the author callback even when the output is concealed;
            // preserve behavior and leave full validation to the factory.
            const result=configuration.permissibleOutputs(name,entry);
            if (concealedDependent) continue;
            const outputs=Array.isArray(result) ? result : result?.options;
            if (!Array.isArray(outputs)) continue; // factory reports author errors
            for (const output of outputs)
              if (typeof output?.latex==='string') strings.add(output.latex);
            const preferredId=Array.isArray(result) ? null : result?.preferredId;
            const preferred=outputs.find(output=>output?.id===preferredId);
            if (preferred?.latex) strings.add(`\\boldsymbol{${preferred.latex}}`);
          }
        }
      }
      return strings;
    }
    async function prepare({configuration, accessibleMathLatex, preloadLatex=[]}={}) {
      const mj=await ready();
      // MathJax 3 remains supported for the frozen, independently secured demo.
      if (String(mj.version).startsWith('3.'))
        return lastPreparation={mathJaxVersion:mj.version,renderer:'CHTML',safeStatus:'legacy-managed'};
      if (!String(mj.version).startsWith('4.'))
        throw new Error(`Unsupported MathJax version ${mj.version}`);
      const doc=mj.startup.document;
      const safeStatus=await ensureSafe(mj,doc);
      ensureCommonHTML(mj);
      if (preparedDocument!==doc || preparedJax!==doc.outputJax) {
        preparedInputs=new Set();
        preparedDocument=doc;
        preparedJax=doc.outputJax;
      }
      const latexes=configuredLatex(configuration);
      // Advanced authors using staticMath() can declare additional fragments.
      for (const latex of preloadLatex) latexes.add(latex);
      if (accessibleMathLatex) latexes.add(accessibleMathLatex);
      for (const latex of latexes) {
        if (!preparedInputs.has(latex)) {
          await doc.convertPromise(latex,{display:false});
          preparedInputs.add(latex);
        }
      }
      // Prime a zero-value fallback used by some wheel configurations.
      if (!preparedInputs.has('0')) {
        await doc.convertPromise('0',{display:false});
        preparedInputs.add('0');
      }
      const chtmlStylesheet=ensureCommonHTMLStylesheet(mj);
      return lastPreparation={mathJaxVersion:mj.version,renderer:doc.outputJax.name,
        safeStatus,preparedExpressions:preparedInputs.size,chtmlStylesheet};
    }
    function tex2node(latex, options={display:false}) {
      const mj = window.MathJax;
      if (String(mj?.version||'').startsWith('3.'))
        return mj.tex2chtml(latex,options);
      const doc = mj?.startup?.document;
      if (!doc || doc.outputJax?.name !== 'CHTML' || !preparedInputs.has(latex))
        throw new Error(`Formula Wheels: MathJax 4 CommonHTML expression not prepared: ${latex}. `+
          'Call await FormulaWheelsMath.prepare({configuration, accessibleMathLatex, preloadLatex}) before createFormulaWheels().');
      return doc.convert(latex,options);
    }
    return Object.freeze({prepare, tex2node, status:()=>lastPreparation && {...lastPreparation}});
  })();
  window.FormulaWheelsMath = FWMath;

  // Default authoring entry point in MathJax 4: one call; no public preparation
  // step or security hook is required. Keep the original synchronous API for
  // approved legacy usages and the 389 historical regression checks.
  async function createFormulaWheelsAsync(options={}) {
    const latex=options.accessibleMathLatex ?? options.accessibleEquationLatex;
    await FWMath.prepare({configuration:options.configuration,
      accessibleMathLatex:latex, preloadLatex:options.preloadLatex||[]});
    return createFormulaWheels(options);
  }
  window.createFormulaWheelsAsync=createFormulaWheelsAsync;
  window.createFormulaWheels=createFormulaWheels;
  window.createEquationWheels=createFormulaWheels; // Deprecated compatibility alias.
})();
