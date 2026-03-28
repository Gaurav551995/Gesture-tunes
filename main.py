import os
import time

import cv2
import mido
from cvzone.HandTrackingModule import HandDetector


CHORDS = {
    4: [60, 64, 67],
    8: [62, 66, 69],
    12: [64, 67, 71],
    16: [67, 71, 74],
    20: [69, 72, 76],
}

FINGERTIP_IDS = [4, 8, 12, 16, 20]


def env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def should_use_gui() -> bool:
    if env_flag("HEADLESS", False):
        return False
    return bool(os.getenv("DISPLAY") or os.name == "nt")


class NullMidiOut:
    def send(self, message):
        print(f"[midi-disabled] {message}")

    def close(self):
        return None


def setup_midi():
    preferred_port = os.getenv("MIDI_PORT", "")
    require_midi = env_flag("REQUIRE_MIDI", False)

    try:
        output_ports = mido.get_output_names()
    except Exception as exc:
        if require_midi:
            raise RuntimeError(f"Failed to enumerate MIDI ports: {exc}") from exc
        print(f"MIDI unavailable, using log-only mode: {exc}")
        return NullMidiOut()

    selected_port = None
    if preferred_port:
        selected_port = next((port for port in output_ports if preferred_port in port), None)
    else:
        selected_port = next((port for port in output_ports if "loopMIDI" in port), None)

    if selected_port is None and output_ports:
        selected_port = output_ports[0]

    if selected_port is None:
        if require_midi:
            raise RuntimeError("No MIDI output port found.")
        print("No MIDI output port found, using log-only mode.")
        return NullMidiOut()

    midi_out = mido.open_output(selected_port)
    print(f"Opened MIDI port: {selected_port}")
    midi_out.send(mido.Message("program_change", program=24))
    return midi_out


def setup_camera():
    camera_index = int(os.getenv("CAMERA_INDEX", "0"))
    required = env_flag("REQUIRE_CAMERA", False)

    cap = cv2.VideoCapture(camera_index)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 500)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 500)
    cap.set(cv2.CAP_PROP_FPS, 30)

    if cap.isOpened():
        print(f"Opened camera index {camera_index}")
        return cap

    cap.release()
    if required:
        raise RuntimeError(f"Unable to open camera index {camera_index}.")

    print("Camera unavailable, exiting gracefully. Set REQUIRE_CAMERA=true to fail instead.")
    return None


def main():
    show_gui = should_use_gui()
    midi_out = setup_midi()
    cap = None

    try:
        cap = setup_camera()
        if cap is None:
            return

        detector = HandDetector(detectionCon=0.9, maxHands=2)
        active_notes = set()

        while True:
            success, img = cap.read()
            if not success or img is None:
                print("Camera frame read failed, stopping.")
                break

            img = cv2.flip(img, 1)
            hands, img = detector.findHands(img, draw=False)
            new_active_notes = set()

            if hands:
                for hand in hands:
                    flipped_type = "Right" if hand["type"] == "Left" else "Left"
                    fingers = detector.fingersUp(hand)
                    bbox = hand["bbox"]
                    cx, cy, _, _ = bbox

                    if show_gui:
                        cv2.putText(
                            img,
                            flipped_type,
                            (cx, cy - 30),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            1,
                            (0, 255, 0),
                            2,
                        )

                    print(f"Detected {flipped_type} hand | Fingers: {fingers}")

                    for idx, is_up in enumerate(fingers):
                        if is_up:
                            landmark_id = FINGERTIP_IDS[idx]
                            new_active_notes.update(CHORDS.get(landmark_id, []))

            for note in new_active_notes - active_notes:
                midi_out.send(mido.Message("note_on", note=note, velocity=64, time=0))

            for note in active_notes - new_active_notes:
                midi_out.send(mido.Message("note_off", note=note, velocity=64, time=0))

            active_notes = new_active_notes

            if show_gui:
                cv2.imshow("Hand MIDI Controller", img)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
            else:
                time.sleep(0.01)

    finally:
        if cap is not None:
            cap.release()
        if show_gui:
            cv2.destroyAllWindows()
        if hasattr(midi_out, "close"):
            midi_out.close()


if __name__ == "__main__":
    main()
