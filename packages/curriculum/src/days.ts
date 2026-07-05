/**
 * Day pacing helpers. Days are presentation-side grouping: the router
 * never consults them (routing is prereq/mastery-driven), but the play
 * surface uses them to scope progress, celebrate a finished session and
 * offer a natural stopping point.
 */

import type { Curriculum, DayPlan, SkillNode } from './types.js';

/** The day a node belongs to, or null when the band has no day pacing. */
export function dayForNode(curriculum: Curriculum, nodeId: string): DayPlan | null {
  return curriculum.days?.find((d) => d.nodes.includes(nodeId)) ?? null;
}

/** The day's nodes, resolved in play order. */
export function dayNodes(curriculum: Curriculum, day: DayPlan): SkillNode[] {
  return day.nodes.map((id) => {
    const node = curriculum.nodes.find((n) => n.id === id);
    if (!node) throw new Error(`day ${day.day} references unknown node '${id}'`);
    return node;
  });
}

/** The day after `day`, or null when it is the band's last. */
export function nextDay(curriculum: Curriculum, day: DayPlan): DayPlan | null {
  const days = curriculum.days ?? [];
  const i = days.findIndex((d) => d.day === day.day);
  return i >= 0 && i + 1 < days.length ? days[i + 1]! : null;
}
