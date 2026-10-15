export type TeamId = 'red' | 'blue' | 'yellow' | 'cyan';

export const TEAM_IDS: readonly TeamId[] = ['red', 'blue', 'yellow', 'cyan'];

/**
 * Hue names and values are aligned here; the previous build bound `blue` to a
 * green value and `cyan` to a blue one, so labels and pixels disagreed.
 */
export const TEAM_COLORS: Record<TeamId, { hex: number; css: string; label: string }> = {
  red: { hex: 0xff4757, css: '#ff4757', label: 'Merah' },
  blue: { hex: 0x2f7bff, css: '#2f7bff', label: 'Biru' },
  yellow: { hex: 0xffc21a, css: '#ffc21a', label: 'Kuning' },
  cyan: { hex: 0x00c8d4, css: '#00c8d4', label: 'Sian' }
};

export function isTeamId(value: unknown): value is TeamId {
  return typeof value === 'string' && (TEAM_IDS as readonly string[]).includes(value);
}
