# Gesture Tunes

Gesture Tunes is a browser-based hand gesture music app. It uses your webcam to detect left and right hands, then turns pressed fingers into musical chords.

## What It Does

- Uses MediaPipe hand tracking in the browser
- Supports browser speaker output with Web Audio
- Supports MIDI output when available in Chrome or Edge
- Uses different note ranges for left and right hands
- Supports pressing multiple fingers at the same time to layer chords

## Run On Windows

The easiest way:

1. Double-click `start.bat`
2. Wait for the PowerShell server window to open
3. Your browser should open `http://localhost:8000`
4. Click `Enable Camera`
5. Click `Enable MIDI` if you want to use a MIDI device

Keep the PowerShell server window open while using the app.

## Run Manually

If you prefer, you can also serve the folder yourself and open it in a browser on `localhost`.

Example URL:

```text
http://localhost:8000
```

## Browser Recommendations

- Use Chrome or Edge for the best Web MIDI support
- `localhost` is recommended for webcam and audio permissions

## How To Play

1. Show an open hand to the camera
2. Press or fold one or more fingers
3. Each pressed finger triggers a mapped chord
4. Multiple pressed fingers can play together

Current mapping:

### Left Hand

- Thumb: `C Major` -> `C3 E3 G3`
- Index: `D Major` -> `D3 F#3 A3`
- Middle: `E Minor` -> `E3 G3 B3`
- Ring: `G Major` -> `G3 B3 D4`
- Pinky: `A Minor` -> `A3 C4 E4`

### Right Hand

- Thumb: `C Major` -> `C4 E4 G4`
- Index: `D Major` -> `D4 F#4 A4`
- Middle: `E Minor` -> `E4 G4 B4`
- Ring: `G Major` -> `G4 B4 D5`
- Pinky: `A Minor` -> `A4 C5 E5`

## Notes

- If no MIDI device is available, the app can still play through browser speakers
- Left and right hand labels are shown on screen
- Hand tracking depends on lighting, camera angle, and clear finger visibility

## Project Files

- `index.html` -> main app page
- `app.js` -> gesture detection and sound logic
- `styles.css` -> UI styling
- `start.bat` -> one-click Windows launcher
- `serve.ps1` -> local PowerShell static server
