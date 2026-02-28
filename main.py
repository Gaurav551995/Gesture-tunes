import mido
import cv2
from cvzone.HandTrackingModule import HandDetector

# --- MIDI Setup ---
output_ports = mido.get_output_names()
loopmidi_port = next((port for port in output_ports if 'loopMIDI' in port), None)

if loopmidi_port is None:
    raise RuntimeError("loopMIDI port not found. Make sure loopMIDI is running.")

midi_out = mido.open_output(loopmidi_port)
print(f"Opened MIDI port: {loopmidi_port}")

midi_out.send(mido.Message('program_change', program=24))  # Nylon Guitar

# --- Chord Mapping ---
chords = {
    4: [60, 64, 67],   # Thumb → C Major
    8: [62, 66, 69],   # Index → D Major
    12: [64, 67, 71],  # Middle → E Minor
    16: [67, 71, 74],  # Ring → G Major
    20: [69, 72, 76],  # Pinky → A Minor
}

# --- Camera Setup ---
cap = cv2.VideoCapture(0)
cap.set(3, 500)
cap.set(4, 500)
cap.set(cv2.CAP_PROP_FPS, 30)

detector = HandDetector(detectionCon=0.9, maxHands=2)
active_notes = set()

# --- Main Loop ---
while True:
    success, img = cap.read()
    img = cv2.flip(img, 1)  # Flip image for mirror effect

    hands, img = detector.findHands(img, draw=False)  # ❗ Important: draw=False

    if hands:
        new_active_notes = set()

        for hand in hands:
            # Manually reverse label due to flip
            flipped_type = "Right" if hand["type"] == "Left" else "Left"

            fingers = detector.fingersUp(hand)
            bbox = hand['bbox']
            cx, cy, w, h = bbox

            # Draw landmarks manually
           # detector.drawHands(img, hands)  # Correct method to draw hands and landmarks

            # Draw corrected label manually
            cv2.putText(img, flipped_type, (cx, cy - 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

            print(f"🖐️ Detected {flipped_type} hand | Fingers: {fingers}")

            for idx, is_up in enumerate(fingers):
                landmark_id = [4, 8, 12, 16, 20][idx]
                if is_up and landmark_id in chords:
                    new_active_notes.update(chords[landmark_id])

        # Play new notes
        for note in new_active_notes - active_notes:
            midi_out.send(mido.Message("note_on", note=note, velocity=64, time=0))

        # Stop old notes
        for note in active_notes - new_active_notes:
            midi_out.send(mido.Message("note_off", note=note, velocity=64, time=500))

        active_notes = new_active_notes

    # Show the window
    cv2.imshow("🎵 Hand MIDI Controller", img)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# --- Cleanup ---
cap.release()
cv2.destroyAllWindows()
