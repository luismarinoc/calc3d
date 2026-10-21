// User-provided estimated watts, not verified manufacturer or peak measurements.
export const printerProfiles = Object.freeze([
  { id: 'a1', name: 'Bambu Lab A1', watts: 95 },
  { id: 'a1-mini', name: 'Bambu Lab A1 Mini', watts: 45 },
  { id: 'p1p', name: 'Bambu Lab P1P', watts: 80 },
  { id: 'p1s', name: 'Bambu Lab P1S', watts: 100 },
  { id: 'x1-carbon', name: 'Bambu Lab X1 Carbon', watts: 120 },
  { id: 'p2s', name: 'Bambu Lab P2S', watts: 130 },
  { id: 'h2s', name: 'Bambu Lab H2S', watts: 210 },
].map((profile) => Object.freeze(profile)));
export const customPrinter = 'custom';
export function profileForStoredPower(profileId, watts) {
  return printerProfiles.some((profile) => profile.id === profileId && Number(watts) === profile.watts && String(watts).trim() !== '')
    ? profileId : customPrinter;
}
