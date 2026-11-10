function addOptionBadge(board, x, y, letter) {
    return board.create('text', [x, y, letter], {
        display: 'html',
        cssClass: 'option-badge',
        anchorX: 'middle',
        anchorY: 'middle',
        fixed: true,
        highlight: false
    });
}