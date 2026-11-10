
const magnitudeBarColors = [ // A list of default colors
    '#65BCE7', // Sky blue
    '#E87787', // Coral pink
    '#228833', // Green
    '#DCBA53', // Golden yellow
    '#7654C5'  // Lavender
];

// Keep track of how many bars each board has created.
const magnitudeBarCounts = new WeakMap();

function addMagnitudeBar(board, start, end, options = {}) {
    const { directional = false, ...styleOverrides } = options;

    // Find the next color for this board.
    const count = magnitudeBarCounts.get(board) ?? 0;
    const color = magnitudeBarColors[count % magnitudeBarColors.length];

    // Advance to the next color.
    magnitudeBarCounts.set(board, count + 1);

    return board.create('segment', [start, end], {
        strokeColor: color,
        strokeWidth: 12,
        strokeOpacity: 0.6,
        lineCap: 'butt',
        fixed: true,
        highlight: false,
        layer: 8,
        ...(directional ? {
            lastArrow: { type: 1, size: 2 }
        } : {}),
        ...styleOverrides
    });
}