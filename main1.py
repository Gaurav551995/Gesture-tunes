import mido

outputs = mido.get_output_names()
print("Available MIDI Output Ports:", outputs)

# Try to find loopMIDI automatically
loopmidi_port = next((port for port in outputs if 'loopMIDI' in port), None)

if loopmidi_port:
    midi_out = mido.open_output(loopmidi_port)
    print(f"✅ Opened MIDI port: {loopmidi_port}")
else:
    print("❌ loopMIDI port not found. Please ensure it's running.")
