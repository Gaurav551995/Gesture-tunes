const FINGER_ORDER = ["thumb", "index", "middle", "ring", "pinky"];

const HAND_CHORDS = {
  Left: {
    thumb: { name: "C Major", notes: [48, 52, 55] },
    index: { name: "D Major", notes: [50, 54, 57] },
    middle: { name: "E Minor", notes: [52, 55, 59] },
    ring: { name: "G Major", notes: [55, 59, 62] },
    pinky: { name: "A Minor", notes: [57, 60, 64] },
  },
  Right: {
    thumb: { name: "C Major", notes: [60, 64, 67] },
    index: { name: "D Major", notes: [62, 66, 69] },
    middle: { name: "E Minor", notes: [64, 67, 71] },
    ring: { name: "G Major", notes: [67, 71, 74] },
    pinky: { name: "A Minor", notes: [69, 72, 76] },
  },
};

const videoElement = document.getElementById("input-video");
const canvasElement = document.getElementById("output-canvas");
const canvasCtx = canvasElement.getContext("2d");

const cameraButton = document.getElementById("camera-button");
const midiButton = document.getElementById("midi-button");
const midiOutputSelect = document.getElementById("midi-output");

const cameraStatus = document.getElementById("camera-status");
const audioStatus = document.getElementById("audio-status");
const midiStatus = document.getElementById("midi-status");
const handStatus = document.getElementById("hand-status");
const chordStatus = document.getElementById("chord-status");
const gestureBadge = document.getElementById("gesture-badge");

let hands;
let camera;
let midiAccess = null;
let selectedOutputId = "";
let activeNotes = new Set();
let audioContext = null;
let synthEnabled = false;
const activeOscillators = new Map();
let pendingGestureSignature = "";
let pendingGestureFrames = 0;

const GESTURE_STABILITY_FRAMES = 4;

function setStatus(element, message) {
  element.textContent = message;
}

function normalizeHandedness(label) {
  if (label === "Left") {
    return "Right";
  }
  if (label === "Right") {
    return "Left";
  }
  return label;
}

function midiToFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

async function ensureAudioReady() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setStatus(audioStatus, "Web Audio is not supported in this browser");
      return false;
    }
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  synthEnabled = true;
  setStatus(audioStatus, "Browser speaker output ready");
  return true;
}

function getSelectedMidiOutput() {
  if (!midiAccess || !selectedOutputId) {
    return null;
  }
  return midiAccess.outputs.get(selectedOutputId) || null;
}

function playSynthNote(note) {
  if (!synthEnabled || !audioContext || activeOscillators.has(note)) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.03);

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(midiToFrequency(note), audioContext.currentTime);
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start();

  activeOscillators.set(note, { oscillator, gainNode });
}

function stopSynthNote(note) {
  const entry = activeOscillators.get(note);
  if (!entry || !audioContext) {
    return;
  }

  const { oscillator, gainNode } = entry;
  const now = audioContext.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(Math.max(gainNode.gain.value, 0.0001), now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  oscillator.stop(now + 0.1);
  activeOscillators.delete(note);
}

function sendMidiNote(messageType, note) {
  const output = getSelectedMidiOutput();
  if (!output) {
    return false;
  }

  const status = messageType === "note_on" ? 0x90 : 0x80;
  output.send([status, note, 0x64]);
  return true;
}

function emitNoteOn(note) {
  const sentToMidi = sendMidiNote("note_on", note);
  if (!sentToMidi && synthEnabled) {
    playSynthNote(note);
  }
}

function emitNoteOff(note) {
  const sentToMidi = sendMidiNote("note_off", note);
  if (!sentToMidi) {
    stopSynthNote(note);
  }
}

function stopAllNotes() {
  for (const note of activeNotes) {
    emitNoteOff(note);
  }
  activeNotes.clear();
}

function updateMidiSelection() {
  midiOutputSelect.innerHTML = "";

  const speakerOption = document.createElement("option");
  speakerOption.value = "";
  speakerOption.textContent = "Browser speakers only";
  midiOutputSelect.append(speakerOption);

  if (!midiAccess || midiAccess.outputs.size === 0) {
    selectedOutputId = "";
    midiOutputSelect.value = "";
    setStatus(midiStatus, "No MIDI outputs available");
    return;
  }

  for (const output of midiAccess.outputs.values()) {
    const option = document.createElement("option");
    option.value = output.id;
    option.textContent = output.name || `Output ${output.id}`;
    midiOutputSelect.append(option);
  }

  if (selectedOutputId && !midiAccess.outputs.has(selectedOutputId)) {
    selectedOutputId = "";
  }

  midiOutputSelect.value = selectedOutputId;
  const activeOutput = getSelectedMidiOutput();
  setStatus(midiStatus, activeOutput ? `Connected to ${activeOutput.name}` : "Using browser speakers");
}

async function enableMidi() {
  await ensureAudioReady();

  if (!("requestMIDIAccess" in navigator)) {
    setStatus(midiStatus, "Web MIDI is not supported in this browser");
    return;
  }

  try {
    midiAccess = await navigator.requestMIDIAccess();
    midiAccess.onstatechange = updateMidiSelection;
    updateMidiSelection();
  } catch (error) {
    setStatus(midiStatus, `MIDI permission failed: ${error.message}`);
  }
}

function isFingerRaised(landmarks, fingerName, handednessLabel) {
  if (fingerName === "thumb") {
    const thumbTip = landmarks[4];
    const thumbJoint = landmarks[3];
    if (handednessLabel === "Left") {
      return thumbTip.x < thumbJoint.x;
    }
    return thumbTip.x > thumbJoint.x;
  }

  const indices = {
    index: [8, 6],
    middle: [12, 10],
    ring: [16, 14],
    pinky: [20, 18],
  };

  const [tipIndex, jointIndex] = indices[fingerName];
  return landmarks[tipIndex].y < landmarks[jointIndex].y;
}

function getRaisedFingers(landmarks, handednessLabel) {
  return FINGER_ORDER.filter((fingerName) =>
    isFingerRaised(landmarks, fingerName, handednessLabel)
  );
}

function getPressedFingers(landmarks, handednessLabel) {
  const raisedFingers = getRaisedFingers(landmarks, handednessLabel);
  if (raisedFingers.length < 2) {
    return [];
  }

  const pressedFingers = FINGER_ORDER.filter((fingerName) => !raisedFingers.includes(fingerName));
  if (pressedFingers.length === 0 || pressedFingers.length > 3) {
    return [];
  }

  return pressedFingers;
}

function formatHandedness(labels) {
  if (labels.length === 0) {
    return "No hands detected";
  }
  return [...new Set(labels)].join(" + ");
}

function serializeTriggers(triggers) {
  return triggers
    .map((trigger) => `${trigger.handedness}:${trigger.finger}`)
    .sort()
    .join("|");
}

function syncNotes(nextNotes) {
  for (const note of nextNotes) {
    if (!activeNotes.has(note)) {
      emitNoteOn(note);
    }
  }

  for (const note of activeNotes) {
    if (!nextNotes.has(note)) {
      emitNoteOff(note);
    }
  }

  activeNotes = nextNotes;
}

function describeActiveChords(chords) {
  if (chords.length === 0) {
    return "None";
  }
  return [...new Set(chords)].join(", ");
}

function drawFallbackFrame() {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.fillStyle = "#132321";
  canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.fillStyle = "rgba(255,255,255,0.88)";
  canvasCtx.font = "28px Space Grotesk";
  canvasCtx.fillText("Enable the camera to start tracking your hand.", 42, 80);
  canvasCtx.restore();
}

function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  const nextNotes = new Set();
  let activeChords = [];
  const visibleHands = [];
  const rawTriggers = [];

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    results.multiHandLandmarks.forEach((landmarks, index) => {
      const rawHandedness = results.multiHandedness?.[index]?.label || "Unknown";
      const handedness = normalizeHandedness(rawHandedness);
      visibleHands.push(handedness);

      drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
        color: "#ffd166",
        lineWidth: 4,
      });
      drawLandmarks(canvasCtx, landmarks, {
        color: "#fefae0",
        fillColor: "#b14f2b",
        lineWidth: 2,
        radius: 4,
      });

      const wrist = landmarks[0];
      canvasCtx.fillStyle = "#ffffff";
      canvasCtx.font = "24px Space Grotesk";
      canvasCtx.fillText(handedness, wrist.x * canvasElement.width + 12, wrist.y * canvasElement.height - 12);

      const pressedFingers = getPressedFingers(landmarks, handedness);
      pressedFingers.forEach((finger) => {
        rawTriggers.push({ handedness, finger });
      });
    });
  }

  const gestureSignature = serializeTriggers(rawTriggers);
  if (gestureSignature === pendingGestureSignature) {
    pendingGestureFrames += 1;
  } else {
    pendingGestureSignature = gestureSignature;
    pendingGestureFrames = 1;
  }

  if (gestureSignature && pendingGestureFrames >= GESTURE_STABILITY_FRAMES) {
    rawTriggers.forEach(({ handedness, finger }) => {
      HAND_CHORDS[handedness][finger].notes.forEach((note) => nextNotes.add(note));
      activeChords.push(`${handedness} ${finger}: ${HAND_CHORDS[handedness][finger].name}`);
    });
  } else if (!gestureSignature) {
    activeChords = [];
  }

  syncNotes(nextNotes);
  setStatus(handStatus, formatHandedness(visibleHands));
  const chordLabel = describeActiveChords(activeChords);
  setStatus(chordStatus, chordLabel);
  gestureBadge.textContent =
    activeChords.length > 0 ? `Playing ${chordLabel}` : visibleHands.length > 0 ? "Open hand ready. Press one or more fingers." : "No hands detected";

  canvasCtx.restore();
}

async function enableCamera() {
  await ensureAudioReady();

  if (!hands) {
    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.6,
    });
    hands.onResults(onResults);
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: "user" },
      audio: false,
    });

    videoElement.srcObject = stream;
    await videoElement.play();

    camera = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 1280,
      height: 720,
    });

    await camera.start();
    setStatus(cameraStatus, "Camera connected");
    gestureBadge.textContent = "Show an open hand, then press one or more fingers";
  } catch (error) {
    setStatus(cameraStatus, `Camera permission failed: ${error.message}`);
  }
}

cameraButton.addEventListener("click", enableCamera);
midiButton.addEventListener("click", enableMidi);
midiOutputSelect.addEventListener("change", (event) => {
  selectedOutputId = event.target.value;
  stopAllNotes();
  const output = getSelectedMidiOutput();
  setStatus(midiStatus, output ? `Connected to ${output.name}` : "Using browser speakers");
});

window.addEventListener("beforeunload", () => {
  stopAllNotes();
  const tracks = videoElement.srcObject?.getTracks?.() || [];
  tracks.forEach((track) => track.stop());
});

updateMidiSelection();
drawFallbackFrame();
