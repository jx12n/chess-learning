/**
 * Board view: pure presentation. It draws whatever FEN the core hands it
 * and reports clicks; it holds no chess knowledge beyond how to paint a
 * FEN's piece-placement field. Legality, highlighting decisions and goal
 * squares are all supplied by the caller (who got them from the core).
 */

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

// Both colors use the solid/filled glyph shapes — the "white chess piece"
// code points (♔♕♖♗♘♙) render as hollow outlines in most system fonts, so
// white pieces are drawn with the same filled glyphs and colored via CSS.
const GLYPHS: Record<string, string> = {
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

/** Parse just the piece-placement field of a FEN into square → letter. */
function piecePlacement(fen: string): Map<string, string> {
  const placement = fen.trim().split(/\s+/)[0] ?? '';
  const out = new Map<string, string>();
  let rank = 8;
  let fileIdx = 0;
  for (const ch of placement) {
    if (ch === '/') {
      rank -= 1;
      fileIdx = 0;
    } else if (/\d/.test(ch)) {
      fileIdx += Number(ch);
    } else {
      out.set(`${FILES[fileIdx]}${rank}`, ch);
      fileIdx += 1;
    }
  }
  return out;
}

export interface BoardDecorations {
  /** Square of the currently selected piece. */
  selected?: string | null;
  /** Legal destination squares (dot). */
  targets?: Set<string>;
  /** Legal capture destinations (ring instead of dot). */
  captureTargets?: Set<string>;
  /** Goal square for reach-square exercises (star). */
  goal?: string | null;
  /** The two squares of the last move. */
  lastMove?: [string, string] | null;
  /** One-shot flash: correct (green) / wrong (red). */
  flash?: { square: string; kind: 'good' | 'bad' } | null;
}

export class BoardView {
  private readonly root: HTMLElement;
  private readonly squares = new Map<string, HTMLElement>();
  onSquareClick: ((square: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'board';
    for (let rank = 8; rank >= 1; rank--) {
      for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
        const name = `${FILES[fileIdx]}${rank}`;
        const sq = document.createElement('button');
        sq.type = 'button';
        sq.className = `square ${(fileIdx + rank) % 2 === 1 ? 'light' : 'dark'}`;
        sq.dataset.square = name;
        sq.setAttribute('aria-label', name);
        if (rank === 1) {
          const f = document.createElement('span');
          f.className = 'coord coord-file';
          f.textContent = FILES[fileIdx]!;
          sq.appendChild(f);
        }
        if (fileIdx === 0) {
          const r = document.createElement('span');
          r.className = 'coord coord-rank';
          r.textContent = String(rank);
          sq.appendChild(r);
        }
        const piece = document.createElement('span');
        piece.className = 'piece';
        sq.appendChild(piece);
        sq.addEventListener('click', () => this.onSquareClick?.(name));
        this.squares.set(name, sq);
        this.root.appendChild(sq);
      }
    }
    container.appendChild(this.root);
  }

  render(fen: string, deco: BoardDecorations = {}): void {
    const placement = piecePlacement(fen);
    for (const [name, el] of this.squares) {
      const letter = placement.get(name);
      const pieceEl = el.querySelector<HTMLElement>('.piece')!;
      pieceEl.textContent = letter ? (GLYPHS[letter] ?? '?') : '';
      pieceEl.classList.toggle('white-piece', !!letter && letter === letter.toUpperCase());
      el.classList.toggle('selected', deco.selected === name);
      el.classList.toggle('target', !!deco.targets?.has(name) && !deco.captureTargets?.has(name));
      el.classList.toggle('capture-target', !!deco.captureTargets?.has(name));
      el.classList.toggle('goal', deco.goal === name);
      el.classList.toggle(
        'last-move',
        !!deco.lastMove && (deco.lastMove[0] === name || deco.lastMove[1] === name),
      );
      el.classList.remove('flash-good', 'flash-bad');
    }
    if (deco.flash) {
      const el = this.squares.get(deco.flash.square);
      if (el) {
        // Retrigger the CSS animation.
        void el.offsetWidth;
        el.classList.add(deco.flash.kind === 'good' ? 'flash-good' : 'flash-bad');
      }
    }
  }
}
