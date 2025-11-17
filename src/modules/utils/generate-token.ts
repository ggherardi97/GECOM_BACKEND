export function generateToken(length: number = 16): string {
  return Math.random()
    .toString(36)
    .substring(2, length + 2);
}
