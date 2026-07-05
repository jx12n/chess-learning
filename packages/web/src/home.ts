/**
 * The front door: "Who's playing today?"
 *
 * Renders one card per player profile (plus the unclaimed pre-profile
 * save, if any) and a create-a-player form. Selecting a card hands off
 * to the lesson at play.html. The only curriculum use here is telling a
 * card which day its player is on — day numbers and titles come from
 * the curriculum data, never from this file.
 */

import './style.css';
import {
  counterLearnerModel as model,
  dayForNode,
  nextStep,
  theBasics,
} from '@chess/curriculum';
import {
  claimLegacyState,
  createProfile,
  legacyStateRaw,
  PROFILE_PIECES,
  profiles,
  profileStateKey,
  setCurrentProfile,
} from './profiles.js';

const curriculum = theBasics();

/** The name the unclaimed pre-profile save is offered under: the app's
 * first student, from the days before the app knew more than one. */
const FIRST_STUDENT = { name: 'Niboo', piece: '♜' };

function goPlay(): void {
  location.href = './play.html';
}

/** "Day N" / "All 7 days ⭐" for a serialized learner state, else "New". */
function badgeFor(raw: string | null): string {
  if (raw === null) return 'New';
  try {
    const state = model.deserialize(raw);
    const step = nextStep(curriculum, model, state);
    if (step.done) return `All ${curriculum.days?.length ?? 0} days ⭐`;
    const day = dayForNode(curriculum, step.node.id);
    return day !== null ? `Day ${day.day}` : 'Playing';
  } catch {
    return 'New';
  }
}

function stateRawFor(profileId: string): string | null {
  try {
    return localStorage.getItem(profileStateKey(profileId));
  } catch {
    return null;
  }
}

function card(opts: {
  piece: string;
  name: string;
  badge: string;
  tag?: string;
  onClick: () => void;
}): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'player-card';
  const glyph = document.createElement('span');
  glyph.className = 'glyph';
  glyph.textContent = opts.piece;
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = opts.name;
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = opts.badge;
  button.append(glyph, name, badge);
  if (opts.tag) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = opts.tag;
    button.appendChild(tag);
  }
  button.addEventListener('click', opts.onClick);
  return button;
}

function renderPlayers(): void {
  const host = document.getElementById('players')!;
  host.innerHTML = '';

  for (const profile of profiles()) {
    host.appendChild(
      card({
        piece: profile.piece,
        name: profile.name,
        badge: badgeFor(stateRawFor(profile.id)),
        onClick: () => {
          setCurrentProfile(profile.id);
          goPlay();
        },
      }),
    );
  }

  // A save from before profiles existed: offer it to the first student.
  const legacy = legacyStateRaw();
  if (legacy !== null) {
    host.appendChild(
      card({
        piece: FIRST_STUDENT.piece,
        name: FIRST_STUDENT.name,
        badge: badgeFor(legacy),
        tag: 'saved game',
        onClick: () => {
          claimLegacyState(FIRST_STUDENT.name, FIRST_STUDENT.piece);
          goPlay();
        },
      }),
    );
  }

  const newCard = document.createElement('button');
  newCard.type = 'button';
  newCard.className = 'player-card new';
  newCard.innerHTML = '<span class="glyph">＋</span><span class="name">New player</span>';
  newCard.addEventListener('click', () => {
    const form = document.getElementById('new-player')!;
    form.hidden = false;
    document.getElementById('player-name')!.focus();
  });
  host.appendChild(newCard);
}

function initNewPlayerForm(): void {
  const form = document.getElementById('new-player') as HTMLFormElement;
  const nameInput = document.getElementById('player-name') as HTMLInputElement;
  const pick = document.getElementById('piece-pick')!;
  let chosenPiece: string = PROFILE_PIECES[0];

  for (const piece of PROFILE_PIECES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = piece;
    button.setAttribute('aria-pressed', String(piece === chosenPiece));
    button.addEventListener('click', () => {
      chosenPiece = piece;
      for (const b of Array.from(pick.children)) {
        b.setAttribute('aria-pressed', String(b === button));
      }
    });
    pick.appendChild(button);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (name.length === 0) {
      nameInput.focus();
      return;
    }
    createProfile(name, chosenPiece);
    goPlay();
  });
}

renderPlayers();
initNewPlayerForm();
