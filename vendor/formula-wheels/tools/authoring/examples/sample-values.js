// Demonstration of supported author-authored entry syntax.
const values = [
  {
    id: 'sqrt5',
    latex: String.raw`\sqrt{5}`,
    value: Math.sqrt(5)
  },
  {
    id: 'fraction',
    latex: String.raw`\frac{3}{7}`,
    value: 3 / 7
  },
  {
    id: 'power',
    latex: String.raw`2^{3/2}`,
    value: Math.pow(2, 3/2)
  },
  {
    id: 'author-override',
    latex: String.raw`-\sqrt{4.59}`,
    value: -Math.sqrt(4.59),
    speech: 'negative square root of four point five nine'
  }
];
