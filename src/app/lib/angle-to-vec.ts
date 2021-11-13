var pi = Math.PI;

export const angleToVec = (degrees: number) => {
  const angle = degrees * (pi/180);
  return [Math.cos(angle), Math.sin(angle)];
}