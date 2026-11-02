# Camera Mounting Guide (Entrance Face Detection)

Use this guide to physically install the camera for stable face recognition at entry points.

## 1. Mounting Position

- Install camera on the entry side facing incoming people, not side-on.
- Recommended camera height from floor:
  - 1.5 m to 1.8 m (about chest-to-eye level for most users)
- Recommended subject distance from camera at capture point:
  - 1.0 m to 2.0 m
- Keep one clear "capture zone" marked on floor:
  - Suggested marker at 1.2 m to 1.5 m from camera.

## 2. Camera Angle

- Horizontal angle:
  - Keep camera mostly straight toward the lane (0 to 15 degrees off center).
- Vertical tilt:
  - Slight downward tilt (5 to 12 degrees) to frame face naturally.
- Avoid extreme top-down or side angles; they reduce recognition accuracy.

## 3. Field of View and Framing

- Ensure face occupies enough pixels in frame:
  - Face should be roughly 15% to 35% of frame height at capture point.
- Keep background simple (plain wall if possible).
- Avoid wide empty framing; crop with camera placement rather than digital zoom when possible.

## 4. Lighting Requirements

- Use even front lighting on faces.
- Target illumination:
  - roughly 300 to 600 lux at capture zone.
- Avoid:
  - strong backlight (door/window directly behind person)
  - overhead-only harsh lights causing eye shadows
  - flickering or rapidly changing light sources
- If needed, add two soft lights at front-left and front-right.

## 5. Entrance Flow and Throughput

- Keep one-person-at-a-time lane if possible.
- Ask users to briefly face camera for 0.5 to 1.5 seconds.
- Keep camera stable (use rigid wall bracket, avoid loose stands).

## 6. Weather/Environment (if semi-outdoor)

- Use protective housing for dust/humidity.
- Prevent direct sun on lens.
- Add small hood/shade to reduce glare.

## 7. Installation Checklist

- Camera firmly fixed, no vibration.
- Capture zone marked on floor.
- Face fully visible at zone (no clip at forehead/chin).
- Good exposure in morning/noon/evening conditions.
- Test with multiple heights and skin tones.
- Verify recognition during peak flow.

## 8. Quick Tuning If Detection Is Poor

- Missed detections:
  - move camera closer or lower
  - improve front lighting
- False matches:
  - tighten confidence threshold in AI config
  - collect cleaner enrollment images
- Many unknowns:
  - re-check face orientation and distance at capture zone
  - reduce backlight and glare
