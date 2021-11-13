var pi = Math.PI;

export const angleToVec = (degrees: number) => {
  const angle = degrees * (pi/180);
  const x = Math.cos(angle)
  const y = Math.sin(angle)
  return [x, y]
}