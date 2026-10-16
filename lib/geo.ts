export function distanceInMeters(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = radians(fromLat);
  const lat2 = radians(toLat);
  const deltaLat = lat2 - lat1;
  const deltaLng = radians(toLng - fromLng);
  const arc =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

export function isSydneyCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -34.05 && lat <= -33.75 && lng >= 150.95 && lng <= 151.3;
}
