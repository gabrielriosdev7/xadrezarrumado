/**
 * board.js — desenha o tabuleiro e anima as jogadas recebidas do servidor.
 */

const PIECE_SYMBOLS = {
    white: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
    black: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' },
};

export const Board = {
    element: document.getElementById('board'),
    onSquareClick: null,
    audioContext: null,

    /**
     * Atualiza o tabuleiro e, quando informada a jogada, desliza a peça
     * da casa de origem até o destino. Capturas também animam a peça
     * retirada do tabuleiro e destacam a casa.
     */
    async render(boardState, selected = null, legalMoves = [], move = null, captured = false) {
        const sourceIndex = move ? move.from[0] * 8 + move.from[1] : -1;
        const sourceSquare = sourceIndex >= 0 ? this.element.children[sourceIndex] : null;
        const sourcePiece = sourceSquare?.querySelector('.piece');
        const sourceRect = sourcePiece?.getBoundingClientRect();
        const movingPiece = sourcePiece?.cloneNode(true);
        const destinationIndex = move ? move.to[0] * 8 + move.to[1] : -1;
        const captureAt = move?.captureAt || move?.to;
        const captureIndex = captured && captureAt ? captureAt[0] * 8 + captureAt[1] : -1;
        const captureSquareBeforeMove = captureIndex >= 0 ? this.element.children[captureIndex] : null;
        const capturedPiece = captured ? captureSquareBeforeMove?.querySelector('.piece')?.cloneNode(true) : null;
        const capturedRect = capturedPiece?.getBoundingClientRect();
        const rookFromIndex = move?.rookMove ? move.rookMove.from[0] * 8 + move.rookMove.from[1] : -1;
        const rookSourcePiece = rookFromIndex >= 0
            ? this.element.children[rookFromIndex]?.querySelector('.piece')
            : null;
        const rookSourceRect = rookSourcePiece?.getBoundingClientRect();
        const rookPiece = rookSourcePiece?.cloneNode(true);

        this.element.innerHTML = '';

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                const isLight = (row + col) % 2 === 0;
                square.className = `square ${isLight ? 'light' : 'dark'}`;

                if (selected && selected[0] === row && selected[1] === col) {
                    square.classList.add('selected');
                }
                if (legalMoves.some(([r, c]) => r === row && c === col)) {
                    square.classList.add('legal-move');
                }

                const piece = boardState[row][col];
                if (piece) {
                    const pieceElement = document.createElement('span');
                    pieceElement.className = `piece ${piece.color === 'white' ? 'piece-white' : 'piece-black'}`;
                    pieceElement.textContent = PIECE_SYMBOLS[piece.color][piece.type];
                    square.appendChild(pieceElement);
                }

                square.addEventListener('click', () => {
                    if (this.onSquareClick) {
                        this.onSquareClick(row, col);
                    }
                });

                this.element.appendChild(square);
            }
        }

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }

        const animations = [];
        const ghosts = [];
        const animatePiece = (piece, fromRect, toRect, duration = 420) => {
            if (!piece || !fromRect || !toRect) {
                return;
            }

            const startX = fromRect.left + fromRect.width / 2;
            const startY = fromRect.top + fromRect.height / 2;
            const endX = toRect.left + toRect.width / 2;
            const endY = toRect.top + toRect.height / 2;
            piece.classList.add('piece-ghost');
            piece.style.left = `${startX}px`;
            piece.style.top = `${startY}px`;
            piece.style.width = `${fromRect.width}px`;
            piece.style.height = `${fromRect.height}px`;
            document.body.appendChild(piece);
            ghosts.push(piece);
            animations.push(piece.animate(
                [
                    { transform: 'translate(-50%, -50%) scale(1.12)' },
                    { transform: `translate(${endX - startX}px, ${endY - startY}px) translate(-50%, -50%) scale(1)` },
                ],
                { duration, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' }
            ));
        };

        if (movingPiece && sourceRect) {
            animatePiece(
                movingPiece,
                sourceRect,
                this.element.children[destinationIndex]?.getBoundingClientRect()
            );
        }

        if (rookPiece && rookSourceRect && move.rookMove) {
            const rookToIndex = move.rookMove.to[0] * 8 + move.rookMove.to[1];
            animatePiece(
                rookPiece,
                rookSourceRect,
                this.element.children[rookToIndex]?.getBoundingClientRect(),
                300
            );
        }

        if (capturedPiece && capturedRect) {
            const captureSquare = this.element.children[captureIndex];
            captureSquare.classList.add('capture-impact');
            capturedPiece.classList.add('piece-ghost');
            capturedPiece.style.left = `${capturedRect.left + capturedRect.width / 2}px`;
            capturedPiece.style.top = `${capturedRect.top + capturedRect.height / 2}px`;
            capturedPiece.style.width = `${capturedRect.width}px`;
            capturedPiece.style.height = `${capturedRect.height}px`;
            document.body.appendChild(capturedPiece);
            ghosts.push(capturedPiece);
            animations.push(capturedPiece.animate(
                [
                    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                    { transform: 'translate(-50%, -58%) scale(0.35) rotate(12deg)', opacity: 0 },
                ],
                { duration: 300, easing: 'ease-out' }
            ));
        }

        if (animations.length > 0) {
            await Promise.all(animations.map(animation => animation.finished));
        }
        ghosts.forEach(ghost => ghost.remove());
        if (captureIndex >= 0) {
            this.element.children[captureIndex]?.classList.remove('capture-impact');
        }
    },

    prepareAudio() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            return null;
        }

        this.audioContext ??= new AudioContext();
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        return this.audioContext;
    },

    playCaptureSound() {
        const context = this.prepareAudio();
        if (!context) {
            return;
        }

        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(190, context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(72, context.currentTime + 0.11);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.14);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.15);
    },
};
