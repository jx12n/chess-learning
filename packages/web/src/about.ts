/**
 * The story page. Prose lives in about.html; the one dynamic piece is
 * the day list, rendered from curriculum data so it can never drift
 * from what the app actually teaches.
 */

import './style.css';
import { theBasics } from '@chess/curriculum';

const list = document.getElementById('day-list')!;
for (const day of theBasics().days ?? []) {
  const item = document.createElement('li');
  const n = document.createElement('span');
  n.className = 'day-n';
  n.textContent = `Day ${day.day}`;
  item.append(n, day.title);
  list.appendChild(item);
}
