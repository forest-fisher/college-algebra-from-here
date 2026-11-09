// ---- PHONE SCREEN ----
const photoBoard = JXG.JSXGraph.initBoard(
    'ariana-photo-board', {
        boundingbox: [0, 9, 20, 0],
        axis: false,
        showNavigation: false,
        showCopyright: false
    }
);

const zoomInput = document.getElementById('ariana-zoom');
const panInput = document.getElementById('ariana-pan');

let zoom = Number(zoomInput.value);
let pan = Number(panInput.value);

// Image dimensions at 1× zoom
const baseWidth = 51.06;
const baseHeight = 15.6;

// Center of the phone screen
const centerX = 10;
const centerY = 4.5;

// Horizontal movement per unit of pan
const panScale = 2.15;

// Photograph of Ariana, sits in the background
const bgImgURL = new URL('../photos/Ariana-zoomed-out-4.png', document.currentScript.src).href;
const photo = photoBoard.create('image', [
    bgImgURL,
    [
        () => centerX - (baseWidth * zoom) / 2 - panScale * pan,
        () => {
            const t = Math.max(0, Math.min(1, zoom - 1));
            const verticalOffset = 1.6 * t * t * (3 - 2 * t);

            return centerY + verticalOffset - (baseHeight * zoom) / 2;
        }
    ],
    [
        () => baseWidth * zoom,
        () => baseHeight * zoom
    ]
], {
    layer: 1,
    fixed: true
});

// Phone frame that sits atop and masks background
const fgImgURL = new URL('../photos/Ariana-phone-2.png', document.currentScript.src).href;
const phone = photoBoard.create('image', [
    fgImgURL,
    [0, 0],
    [20, 9]
], {
    layer: 8,
    fixed: true,
    highlight: false
});

zoomInput.addEventListener('input', function () {
    zoom = Number(zoomInput.value);
    photoBoard.update();
});

panInput.addEventListener('input', function () {
    pan = Number(panInput.value);
    photoBoard.update();
});

// Connect the sliders
function updateInteractive() {
    zoom = Number(zoomInput.value);
    pan = Number(panInput.value);

    photoBoard.update();
    barsBoard.update();
}

zoomInput.addEventListener('input', updateInteractive);
panInput.addEventListener('input', updateInteractive);

// ---- MAGNITUDE BARS ----
const barsBoard = JXG.JSXGraph.initBoard(
    'ariana-bars-board', {
        boundingbox: [0, 5, 10, 0],
        axis: false,
        showNavigation: false,
        showCopyright: false
    }
);