export const random = (min: number, max?: number) => {
  if (!max) max = -min
  return min + Math.random() * (max - min)
}