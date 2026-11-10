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
const baseWidth = 53.14;
const baseHeight = 17.38;

// Center of the phone screen
const centerX = 10;
const centerY = 4.5;

// Horizontal movement per unit of pan
const panScale = 4.3;

// Photograph of Ariana, sits in the background
const bgImgURL = new URL('../photos/Ariana-zoomed-out.png', document.currentScript.src).href;
const photo = photoBoard.create('image', [
    bgImgURL,
    [
        () => centerX - (baseWidth * zoom) / 2 - panScale * pan,
        () => centerY - (baseHeight * zoom) / 2
    ],
    [
        () => baseWidth * zoom,
        () => baseHeight * zoom
    ]
], {
    layer: 1,
    fixed: true,
    highlight: false
});

// Phone frame that sits atop and masks background
const fgImgURL = new URL('../photos/Ariana-phone.png', document.currentScript.src).href;
const phone = photoBoard.create('image', [
    fgImgURL,
    [0, 0],
    [20, 9]
], {
    layer: 8,
    fixed: true,
    highlight: false
});


// -- Event Listeners --
function addMagneticSnap(input, target, snapAt, releaseAt, onUpdate) {
    let snapped = Number(input.value) === target;

    input.addEventListener('input', () => {
        const value = Number(input.value);
        const distance = Math.abs(value - target);

        if (distance <= (snapped ? releaseAt : snapAt)) {
            input.value = target;
            snapped = true;
        } else {
            snapped = false;
        }

        onUpdate(Number(input.value));
        photoBoard.update();
    });
}

// Zoom snaps to 1×
addMagneticSnap(zoomInput, 1, 0.04, 0.10, value => {
    zoom = value;
});

// Pan snaps to center
addMagneticSnap(panInput, 0, 0.04, 0.10, value => {
    pan = value;
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
        boundingbox: [0, 5, 20, 0],
        axis: false,
        showNavigation: false,
        showCopyright: false
    }
);

addOptionBadge(barsBoard, 1, 4, 'A');
addOptionBadge(barsBoard, 1, 3, 'B');
addOptionBadge(barsBoard, 1, 2, 'C');
addOptionBadge(barsBoard, 1, 1, 'D');

const W = 20 * 1550 / 1870; // 16.58
const F = 2.76;             // estimate of face width at 1x zoom
const L = () => 6.74        // estimate of L, which is affected by both zooming and panning
    - 1.55 * (zoom - 1)
    - 4.3 * pan;
const barStart = 2;

// create some gray backdrops underneath the magnitude bars
barsBoard.create('segment', [[barStart, 4], [barStart + W, 4]], {
        strokeColor: '#e9eaec',
        strokeWidth: 12,
        strokeOpacity: 1,
        lineCap: 'butt',
        fixed: true,
        highlight: false,
        layer: 5
})

barsBoard.create('segment', [[barStart, 3], [barStart + W, 3]], {
        strokeColor: '#e9eaec',
        strokeWidth: 12,
        strokeOpacity: 1,
        lineCap: 'butt',
        fixed: true,
        highlight: false,
        layer: 5
})

barsBoard.create('segment', [[barStart, 2], [barStart + W, 2]], {
        strokeColor: '#e9eaec',
        strokeWidth: 12,
        strokeOpacity: 1,
        lineCap: 'butt',
        fixed: true,
        highlight: false,
        layer: 5
})

barsBoard.create('segment', [[barStart, 1], [barStart + W, 1]], {
        strokeColor: '#e9eaec',
        strokeWidth: 12,
        strokeOpacity: 1,
        lineCap: 'butt',
        fixed: true,
        highlight: false,
        layer: 5
})

// A = zF
addMagnitudeBar(barsBoard,
    [barStart, 4],
    [() => barStart + zoom * F, 4]
);

// B = W
addMagnitudeBar(barsBoard,
    [barStart, 3],
    [barStart + W, 3]
);

// C = L + zF
addMagnitudeBar(barsBoard,
    [barStart, 2],
    [() => barStart + L() + zoom * F, 2]
);

// D = W - zF
addMagnitudeBar(barsBoard,
    [barStart, 1],
    [() => barStart + W - zoom * F, 1]
);


// Adding vertical bars around Ariana's face to indicate precisely the width

const screenLeft = (20 - W) / 2;

const faceLeft = () => screenLeft + L();
const faceRight = () => faceLeft() + zoom * F;

const guideStyle = {
    strokeColor: '#FFFFFF',
    strokeWidth: 2.5,
    dash: 3,
    fixed: true,
    highlight: false,
    layer: 9,
    shadow: {
        enabled: true,
        color: [0, 0, 0],
        opacity: 0.45,
        blur: 2,
        offset: [1, 1]
    }
};

// Left edge of face
photoBoard.create('segment', [
    [faceLeft, 1],
    [faceLeft, 8]
], guideStyle);

// Right edge of face
photoBoard.create('segment', [
    [faceRight, 1],
    [faceRight, 8]
], guideStyle);
