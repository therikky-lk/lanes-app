export function isPlayerDismissDrag(dx: number, dy: number): boolean {
  return dy > 10 && dy > Math.abs(dx) * 1.2;
}
export function shouldDismissPlayer(distance: number, velocity: number, height: number): boolean {
  return distance > Math.min(140, height * 0.2) || (distance > 32 && velocity > 0.6);
}
