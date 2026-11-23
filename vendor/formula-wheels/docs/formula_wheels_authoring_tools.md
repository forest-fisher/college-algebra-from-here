# Formula Wheels — Command-line authoring tools (public v1.0.1 candidate)

© 2026 Forest Fisher · MPL-2.0 · Vibe coded with extensive ChatGPT (OpenAI) assistance.

These are three independent, **author-only** tools:

- **`generate-values.cjs`** creates a JavaScript array of Formula Wheels values, with optional noise and anchors.
- **`add-speech.cjs`** adds SRE-generated `speech` properties to existing JavaScript entry objects, leaving existing `speech` properties unchanged.
- **`add-output-speech.cjs`** calls a trusted author-defined `permissibleOutputs()` on canonical wheel values, proposes speech for its results, and writes a standalone copy with a speech lookup and wrapper.

No authoring generator runs in student browsers or during ordinary PreTeXt builds. Neither changes the approved Formula Wheels JavaScript/CSS runtime, MathJax accessibility configuration, or the 22.1-C update mechanism.

## Installation and working directory

From the **Formula Wheels repository root**, install the author-only dependencies and run their tests:

```bash
cd tools/authoring
npm install
npm test
cd ../..
```

For a separate Codespaces trial, extract a repository or toolkit copy into `/workspaces/fw22_2_trial` and run the same commands there.

**Commands below assume your current directory is the Formula Wheels repository root**, or another directory containing `tools/authoring/`. Paths to input and output files are interpreted relative to the directory from which you run the command, not relative to the script's location. If testing in `/workspaces/`, adjust the paths accordingly.

Requires Node.js 20 or newer (Node 22 is suitable). The two speech tools need the installed speech-generation libraries; installing the package once prepares both tools. This candidate pins **Acorn 8.15.0**, **MathJax-full 3.2.1**, and **Speech Rule Engine 4.1.2**. Authoring MathJax 3 is separate from the MathJax 4.1.3 used by the textbook. The top-level authoring dependencies are pinned to exact versions. Run `npm install` in `tools/authoring/`. A package-lock is not included in this candidate; generating and reviewing one in Codespaces before publication is recommended so that future installs can use `npm ci`. Do not commit `node_modules/`.

You can see a command's built-in help at any time:

```bash
node tools/authoring/generate-values.cjs --help
node tools/authoring/add-speech.cjs --help
node tools/authoring/add-output-speech.cjs --help
```

`-h` is an alternative to `--help` for all three commands.

## A. `generate-values.cjs` — create a numerical array

**Basic syntax**

```bash
node tools/authoring/generate-values.cjs --start 2 --end 6 [options]
```

For example:

```bash
node tools/authoring/generate-values.cjs \
  --start -3 --end 1 \
  --increment 0.1 \
  --noise 0.04 \
  --anchors 1 \
  --anchor-values=-2.5,-1.5 \
  --seed 42 \
  --output values.js
```

The script creates a **new** JavaScript file with `id`, `latex`, and numeric `value` in each entry. It does not add `speech`; use Tool B afterward.

### Complete option reference: value generator

| Option | Required? | Default | Meaning and example |
|---|---|---|---|
| `--start NUMBER` | **Yes** | None | First number in the inclusive base sequence; accepts negative or decimal values. Example: `--start -3` |
| `--end NUMBER` | **Yes** | None | Last number in the inclusive base sequence. Must be at least `--start`. Example: `--end 1` |
| `--increment NUMBER` | No | `0.1` | Positive spacing between successive **base-grid** numbers before noise. Example: `--increment 0.05` |
| `--noise NUMBER` | No | `0` | Maximum noise magnitude. Noise is selected in discrete steps inferred from the written decimal precision. Example: `--noise 0.04` selects hundredths, from zero through four hundredths |
| `--noise-mode MODE` | No | `positive` | `positive` or `symmetric`. In **positive** mode noise increases the *magnitude* (negative values move downward; positive values move upward; zero is unchanged). In **symmetric** mode noise may add or subtract regardless of sign |
| `--anchors NUMBER` | No | No regularly spaced anchors | Protects every **multiple of the positive spacing** relative to **zero**. For example, `--anchors 1` protects integers, `--anchors 0.5` protects halves, `--anchors 0.25` protects quarters, and `--anchors 10` protects multiples of ten |
| `--anchor-values LIST` | No | No explicitly listed anchors | Comma-separated base-grid values that must remain unperturbed. Example: `--anchor-values=-2.5,-1.5,0.5`. Can be combined with `--anchors` |
| `--seed TEXT` | No | Randomly generated seed, printed after generation | Makes noise reproducible: identical arguments and seed give identical results. Example: `--seed 42` |
| `--name IDENTIFIER` | No | `values` | Name of the generated JavaScript `const` array. Use a valid simple JavaScript identifier. Example: `--name xValues` |
| `--output FILE` | No | `values.js` | Path/name of the **new** JavaScript file to write. Example: `--output x-values.js`. Existing files are never overwritten |
| `--help` or `-h` | No | Off | Prints the usage guide and exits without creating a file |

**Argument conventions:** Use plain decimal notation, such as `0.1`, `-2.5`, or `10`, rather than exponent notation such as `1e-1`; the generator accepts up to nine digits after the decimal point. A value can immediately follow its flag (`--increment 0.05`) or use `=` (`--increment=0.05`). The `--anchor-values=...` style is particularly convenient for lists that begin with a negative number. Each flag may appear only once; separate values within the comma-separated list instead of repeating `--anchor-values`.

### Base grids, increments, and endpoints

With `--start 2 --end 6` and no increment argument, the base array contains 41 values:

```js
const values = [
  { id: '2',   latex: '2',   value: 2 },
  { id: '2.1', latex: '2.1', value: 2.1 },
  { id: '2.2', latex: '2.2', value: 2.2 },
  // ...
  { id: '6',   latex: '6',   value: 6 },
];
```

The script creates **inclusive endpoints**, and the endpoint must land exactly on the increment grid:

\[\text{end} = \text{start} + n\,(\text{increment})\]

for a nonnegative integer \(n\). For example, `--start 2 --end 3 --increment 0.3` is invalid because the grid does not land on 3. Use an increment or endpoint that makes an exact grid. `--start` and `--end` are *always anchored*, even if you omit all anchor options.

The generated entries appear in increasing order, including when the interval crosses zero. The generator uses exact scaled decimal arithmetic rather than repeated binary floating-point addition, so it avoids output such as `2.3000000000000003`. The limit is **10,000 entries**.

### Noise: positive (away from zero) or symmetric

For `--increment 0.1 --noise 0.04`, the discrete noise sizes are `0`, `0.01`, `0.02`, `0.03`, or `0.04`. Writing `--noise 0.005` instead selects thousandth steps: `0`, `0.001`, …, `0.005`.

| Base value | Possible result in default `positive` mode | Possible result in `symmetric` mode |
|---|---|---|
| `-2.9` | `-2.9` through `-2.94` | `-2.94` through `-2.86` |
| `0` | Always `0` | `-0.04` through `0.04`, unless anchored |
| `2.9` | `2.9` through `2.94` | `2.86` through `2.94` |

The values shown are *possible ranges*, not specific seeded outcomes. Noise is independently sampled for each eligible entry. In **positive** mode, negative numbers subtract the sampled magnitude, positive numbers add it, and zero stays zero. This is why a number near `-2.9` remains visibly associated with the `-2.9` base-grid position instead of shifting toward `-2.8`.

For a strictly increasing array, the script requires:

- `positive` mode: `noise < increment`.
- `symmetric` mode: `2 × noise < increment`.

These checks apply even if some values are anchored. Setting `--noise 0` produces the ordinary evenly spaced array in either mode. **The exact string used for `--noise` determines the discrete precision**: `0.04` selects hundredths, while `0.040` selects thousandths.

### Anchors: multiples relative to zero, plus individual values

Anchors are **base-grid points exempt from noise**. They do not insert new values and do not change the increment.

`--anchors` uses a single positive spacing, measured **from zero**, not from `--start`:

```bash
node tools/authoring/generate-values.cjs \
  --start 2 --end 22 --noise 0.04 \
  --anchors 10 --output tens.js
```

This protects 10 and 20, plus the endpoints 2 and 22. It does **not** protect 12 merely because 12 is ten units after the start.

Use `--anchor-values` for individual points:

```bash
node tools/authoring/generate-values.cjs \
  --start -3 --end 1 --noise 0.04 \
  --anchors 1 \
  --anchor-values=-2.5,-1.5 \
  --output anchored.js
```

This protects all integers and the two specified half-integers. You may use `--anchor-values` without `--anchors` when you want only selected anchors. Each explicitly listed anchor must occur on the original base grid **and lie within the interval**. For a grid with increment 0.1, `-2.5` is valid but `-2.55` is not. Named anchors such as `integers` and a comma-separated list passed to `--anchors` are **not supported**; use numeric spacing and `--anchor-values` instead.

### Seed and output naming

```bash
node tools/authoring/generate-values.cjs \
  --start 2 --end 6 --noise 0.04 \
  --noise-mode symmetric --anchors 1 \
  --seed 42 --name xValues \
  --output x-values.js
```

The generated file contains `const xValues = [...]`. The script prints the seed used. Without `--seed`, a seed is generated for that run; to recreate the same array later, copy the printed seed and reuse the **same arguments**. The generator writes a new file only; to try a different seed, choose a new `--output` filename or move/delete the previous output yourself.

### Generator errors and limitations

The generator refuses missing endpoints; an end smaller than the start; a nonpositive increment; negative noise; an interval that doesn't land exactly on its endpoint; invalid or off-grid anchors; excessive noise that could break ordering; and more than 10,000 values. It accepts no more than nine decimal places and limits the number of discrete noise choices. Invalid input or an existing output file causes exit status `1` and an `ERROR:` message; successful generation exits `0`.

## B. `add-speech.cjs` — add spoken descriptions

**Basic syntax**

```bash
node tools/authoring/add-speech.cjs INPUT.js [options]
```

For example:

```bash
node tools/authoring/add-speech.cjs values.js
```

This uses **ClearSpeak** and writes `values.with-speech.js` for you to inspect. The input remains untouched.

### Complete option reference: speech generator

| Argument / option | Required? | Default | Meaning and example |
|---|---|---|---|
| `INPUT.js` | **Yes** | None | Path to an existing `.js`, `.cjs`, or `.mjs` file containing static Formula Wheels entry objects. Example: `tools/authoring/examples/sample-values.js` |
| `--rules DOMAIN` | No | `clearspeak` | Selects an SRE speech domain. Accepted values are exactly **`clearspeak`**, **`mathspeak`**, or **`chromevox`** (lowercase). Example: `--rules mathspeak` |
| `--output FILE` | No | Input filename with `.with-speech` inserted before the extension | Writes a separate output file. Example: `--output reviewed-values.js`; the destination must differ from the input and must not already exist |
| `--help` or `-h` | No | Off | Prints usage and exits without reading or writing a values file |

For example, compare all three speech styles by using different destination names:

```bash
node tools/authoring/add-speech.cjs values.js --rules clearspeak --output values-clearspeak.js
node tools/authoring/add-speech.cjs values.js --rules mathspeak --output values-mathspeak.js
node tools/authoring/add-speech.cjs values.js --rules chromevox --output values-chromevox.js
```

All three options use **English (`en`)** in this candidate. The generated wording is SRE's actual output, not rephrased by the tool. Review descriptions before using them in teaching material.

### What the speech generator recognizes

An eligible entry is a JavaScript **object literal** containing properties named `id`, `latex`, and `value`. The object can appear in an array or elsewhere in the file. The generator only needs to read the static `latex` property; it does **not execute** the `value` expression or other JavaScript.

Supported forms for `latex` include:

```js
{ id: 'root5', latex: String.raw`\sqrt{5}`, value: Math.sqrt(5) }
{ id: 'frac', latex: '\\frac{3}{7}', value: 3/7 }
{ id: 'simple', latex: '5', value: 5 }
```

An ordinary static backtick template without substitutions is also supported. The `String.raw` form is convenient for TeX because backslashes don't have to be doubled. The SRE tool uses MathJax to convert each supported LaTeX string to MathML and then creates the requested speech.

The following are **not** automatically processed:

```js
{ id: 'dynamic', latex: makeLatex(n), value: n }
{ id: 'templated', latex: `${n}`, value: n }
```

The script also skips cases where insertion is unsafe (for example, certain trailing comments after the last property or objects ending in a spread). It prints a `REVIEW:` message instead of guessing. Dynamically generated outputs inside `permissibleOutputs()` and transients are not enumerated by this static-source tool.

### Existing speech and safe source edits

Suppose an entry already contains:

```js
{
  id: 'my-fraction',
  latex: String.raw`\frac{3}{7}`,
  value: 3/7,
  speech: 'three sevenths'
}
```

The existing `speech` is **preserved exactly**, even if SRE would generate a different phrase. When `speech` is missing, the generator inserts a plain-text `speech: '...'` property; it leaves other code in place, without reformatting the file or evaluating expressions. The generator checks that the resulting JavaScript still parses.

After generation, open the new file and review the suggested descriptions. Edit any descriptions that aren't appropriate, and use that reviewed file as your source going forward. Running the tool again on a reviewed file with additional entries adds speech **only to entries lacking it**. To avoid confusion, note that running on `values.with-speech.js` without `--output` would propose `values.with-speech.with-speech.js` as its next output name.

### Speech tool exit codes

| Exit status | Meaning |
|---|---|
| `0` | The program completed; every recognized entry already had speech or received speech successfully |
| `2` | A new output file **was written**, but some entries were skipped and need manual review; read the `REVIEW:` messages |
| `1` | An error prevented successful operation (such as invalid JavaScript, missing input, invalid domain, no recognized entries, or existing output destination) |

**No overwrite by default means no overwrite at all:** none of these tools has an `--overwrite` or `--in-place` flag in this version.

## C. Full two-command workflow

1. Generate the desired array:

   ```bash
   node tools/authoring/generate-values.cjs \
     --start 2 --end 6 \
     --increment 0.1 --noise 0.04 \
     --anchors 1 --seed 42 \
     --output x-values.js
   ```

2. Optionally edit `x-values.js`, then add speech:

   ```bash
   node tools/authoring/add-speech.cjs x-values.js
   ```

Open and review `x-values.with-speech.js`. Once satisfied, copy the reviewed entries into your Formula Wheels exercise. The approved runtime already understands each entry's optional `speech` property; it requires no additional SRE script in students' browsers.

The authoring tools supplement—but **do not replace**—`accessibleMathLatex` for the complete mathematical relationship. Hidden or omitted dependent values continue to use the existing runtime's non-disclosure behavior. Since mathematical wording can be ambiguous, review every generated description.

## D. `add-output-speech.cjs` — add speech to a mathematical callback (prototype)

**Purpose:** Keep your authored `permissibleOutputs()` mathematics unchanged. Run it for each canonical input entry, generate ClearSpeak for the output expressions it returns, and write a **new** JavaScript file that appends an editable lookup and a wrapper. No modification to the approved Formula Wheels runtime is necessary. This is different from `add-speech.cjs`, which only edits static object literals.

### Example: circle relationship

Start with a **trusted, standalone JavaScript authoring file** containing the value arrays and the complete `configuration` object. The new toolkit includes `tools/authoring/examples/circle-logic.js`, implementing \(x^2+y^2=9\) with 61 selectable values from −3 through 3 on each wheel. Its key structure is:

```js
const configuration = {
  variables: {
    x: {values: xValues, initial: '0'},
    y: {values: yValues, initial: '0'}
  },
  permissibleOutputs(changedVariable, selected) {
    // Your existing calculation returning [] or {options, preferredId}.
  }
};
```

You do **not** have to adopt a new mathematical equation language or generate the callback itself. You do need the arrays and the callback accessible through `configuration` in this authoring file. The source must be executable by Node as *math-only* JavaScript, without browser-only DOM mounting, extra script imports, or `createFormulaWheelsAsync()` calls. `add-output-speech.cjs` deliberately executes the trusted author source while exploring callback results; it does not discover functions hidden in a browser-only closure or safely execute untrusted code. Your ordinary exercise-mounting script should be kept separate and loaded **after** the generated logic file. Existing arrays made using `generate-values.cjs` and `add-speech.cjs` can be incorporated into this file.

Generate the enriched file:

```bash
node tools/authoring/add-output-speech.cjs \
  tools/authoring/examples/circle-logic.js
```

It writes `tools/authoring/examples/circle-logic.with-speech.js`. Open that file and review the `FW_OUTPUT_SPEECH_LOOKUP` near its end. The original mathematical function is present, unchanged; the appended wrapper transparently assigns a speech-enhanced callback to `configuration.permissibleOutputs`. A Formula Wheels exercise that subsequently consumes `configuration` uses the generated speech entries automatically. For example, when selecting \(x=2.1\), both radical branches receive generated descriptions while `preferredId` and `branchKey` remain intact.

### Complete option reference: output speech generator

| Option | Required? | Default | Meaning |
|---|---|---|---|
| `INPUT` | **Yes** | None | Path to a **trusted**, self-contained `.js` or `.cjs` authoring file with a `configuration` object and mathematical callback |
| `--rules DOMAIN` | No | `clearspeak` | `clearspeak`, `mathspeak`, or `chromevox` from SRE |
| `--output FILE` | No | Input base name + `.with-speech.js` | Write a distinct *new* file; refuses to overwrite existing files or the input |
| `--binding NAME` | No | `configuration` | JavaScript identifier naming the authoring object (e.g. `myConfiguration`), with `variables` and `permissibleOutputs` |
| `--follow-up-rounds N` | No | `1` | How many rounds (0–5) to call the callback on generated output entries that can become *selections* on the opposite wheel. Use `0` to examine only canonical input arrays; `1` covers common reverse-direction transient values. The callback is always called for every canonical input in each manipulable variable. More rounds may be necessary for some relationships |
| `--help` or `-h` | No | Off | Print usage |

For an explicitly chosen ruleset and no additional follow-up traversal:

```bash
node tools/authoring/add-output-speech.cjs circle-logic.js \
  --rules mathspeak --follow-up-rounds 0 \
  --output circle-logic.mathspeak.js
```

The script evaluates the **author's actual function**, not an algebraic solver. It validates that returned options contain string `id`, LaTeX `latex`, and a finite numeric `value`, preserves any author-written `speech`, deduplicates SRE conversions by LaTeX, and preserves multi-output `preferredId` (including when the runtime would treat an unknown ID as no preference). The generated wrapper returns the same array-or-object shape with the original `preferredId`, ordering, and `branchKey` values; it does not mutate callback results. `[]` remains `[]`, and unknown LaTeX at runtime is left unchanged for the existing Formula Wheels fallback. A future `sampledOutputs` could pass its result through the same generated `FW_attachOutputSpeech` helper, but that future runtime API is **not implemented here**.

**Important limitations and safeguards:**

- This script **executes your JavaScript** and the mathematical callback. Use it only on your own trusted authoring code, never third-party or student submissions. Node's `vm` timeouts are not a security guarantee against malicious code. Keep callbacks synchronous, deterministic, and side-effect-free.
- It explores finitely many input selections (at most 3,000 calls) and cannot guarantee coverage of arbitrary or unbounded dynamic output domains. Default traversal covers one level beyond the canonical selections; a missing runtime speech lookup falls back to the approved Formula Wheels behavior.
- It is designed for an authoring math/configuration file, **not an already mounted browser exercise**, and must run before the exercise instantiates Formula Wheels. The generated file changes the `configuration.permissibleOutputs` *property* after the authored code; it does **not** rewrite the callback body.
- If an output expression cannot be interpreted by SRE, or a callback errors, the script reports the problem and **does not write a partial output**. Existing author `speech` entries are left unchanged and require no SRE conversion.
- Do not edit and then rerun the generator on the previously generated file. Keep your original math source for regeneration. Speech phrases you review and edit in the **generated lookup** remain author-maintained text; if you regenerate from the original source, copy those manual edits into the new output before using it. Nothing is overwritten automatically.
- The toolkit does not modify student-side math, popup, keyboard, or screen-reader mechanics. It generates text data that the approved runtime already consumes via `speech`.

### Test the generated circle script

```bash
cd tools/authoring
npm test
cd ../..
```

The test suite checks the two roots for \(x=2.1\), returning to generated transient values, preservation of `preferredId` and `branchKey`, and the no-overwrite behavior. An exercise still needs to be manually mounted and tested in a browser if you want to confirm its actual spoken announcements.

## Scope, testing, and licensing

The test suite lives in `tools/authoring/tests/`. Run it with:

```bash
cd tools/authoring
npm test
```

The toolkit uses MPL-2.0 licensing (see `tools/authoring/LICENSE`) and retains the development disclosure above. Third-party dependencies have their own licenses (MathJax and SRE: Apache-2.0; Acorn: MIT); they are installed through npm rather than included in this ZIP.

This documentation describes the **v1.0.1 release candidate**. The authoring scripts are optional and never load in student browsers. The textbook updater must be extended to include the authoring files before expecting them in an update pull request. Review and test the candidates in Codespaces before publishing.
