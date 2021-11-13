export const vecToAngle = (vec: [number, number]) => {
  var angle = Math.atan2(vec[1], vec[0]);
  var degrees = 180*angle/Math.PI;
  return (360+Math.round(degrees))%360;
}