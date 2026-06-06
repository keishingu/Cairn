/* global React */
// photos.jsx — real mountain photo URLs from Unsplash + shared Photo component

// Curated Unsplash photo IDs (mountains, hikers, scenery). Deterministic
// indexing so the same `idx` always returns the same image — important for
// gallery / project cards / project detail headers.
const PHOTO_IDS = [
  '1464822759023-fed622ff2c3b', // misty mountain peak
  '1483728642387-6c3bdd6c93e5', // snowy alpine peaks
  '1454391304352-2bf4678b1a7a', // mountain panorama
  '1519681393784-d120267933ba', // mountain blue hour
  '1486870591958-9b9d0d1dda99', // foggy mountain
  '1454496522488-7a8e488e8606', // mountain range
  '1469854523086-cc02fe5d8800', // mountain hiker trail
  '1426604966848-d7adac402bff', // aerial mountain road
  '1418065460487-3956c3a83d04', // forest mountain
  '1551632811-561732d1e306',    // hiker
  '1506905925346-21bda4d32df4', // mountain trail
  '1444930694458-01babe71870e', // mountain top fog
  '1502082553048-f009c37129b9', // trail close
  '1601925240970-98447a0e0cb0', // alpine
  '1542202229-7d93c33f5d07',    // mountain lake
  '1464822759023-fed622ff2c3b',
  '1543946207-39bd91e70ca7',    // mountain camping
  '1496614932623-0a3a9743552e',
  '1517524008697-84bbe3c3fd98', // climbing
  '1483356046701-7565d31be5c5', // dolomites
];

const photoUrl = (idx, w = 600, h = 400) => {
  const id = PHOTO_IDS[Math.abs(idx) % PHOTO_IDS.length];
  return `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&auto=format&q=70`;
};

// Drop-in replacement for the old SVG MountainPhoto.
// `flat` = no rounded top corners (used when nested inside a card with its own
// radius, or when filling an entire panel).
const MountainPhoto = ({ idx = 0, height = 200, flat = false, radius }) => (
  <div style={{
    width: '100%', height,
    backgroundImage: `url("${photoUrl(idx, 800, Math.round(height * 1.6))}")`,
    backgroundSize: 'cover', backgroundPosition: 'center',
    borderRadius: radius != null ? radius : (flat ? 0 : '10px 10px 0 0'),
    backgroundColor: '#1f2937', // dark placeholder while loading
  }}/>
);

Object.assign(window, { MountainPhoto, photoUrl, PHOTO_IDS });
