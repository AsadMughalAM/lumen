# LUMEN — An interactive study of light

A hanging tubular filament lamp built in real 3D, with a physical rocker switch, synchronised sound, and a bulb you can break and replace.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

## Interaction

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Switch the light on / off | Click the rocker switch, or the **Switch on** button | `L` or `Space` |
| Break the bulb | Click the glass | `B` |
| Fit a new bulb | **Fit a new bulb** button | `N` |
| Brightness | Slider (active while lit) | Arrow keys on the slider |
| Sound | **Sound on/off** and volume | — |

## How it works

- **Lamp** (`components/scene/Lamp.tsx`): the cable, a lathe-turned socket in anodised metal (physical material with clearcoat), a glass tube with real transmission, and a U-shaped filament built as a tube along a curve with a heat map along its length. A point light inside the glass lights the wall and switch and casts the fixture's shadows. The fixture hangs from a pivot and sways like a pendulum.
- **Room** (`components/scene/Room.tsx`): a matte charcoal wall, a cool night fill that gives way to a warm room fill as the lamp heats, and a studio environment built from local light-formers (no HDR download).
- **Switch** (`components/scene/ToggleSwitch3D.tsx`): a metal plate with screws, engraved ON/OFF lettering, a status LED and a rocker paddle on a pivot.
- **Break & replace** (`components/scene/Shards.tsx`): instanced glass shards and sparks, simulated with gravity and spin. A new bulb rises and turns into the socket.
- **Post** (`components/LumenCanvas.tsx`): ACES tone mapping, and bloom with threshold 1, so only the filament blooms. Bloom and vignette both follow the lamp's power.
- **State** (`hooks/useLightController.ts`): light `OFF → TURNING_ON → ON → TURNING_OFF` and bulb `INTACT → BROKEN → FITTING` on one GSAP timeline. Every action restarts from the current animated values, so rapid input always resolves cleanly.
- **Sound** (`audio/AudioEngine.ts`): all synthesised with the Web Audio API, so there are no audio files. It covers a metallic click, an ignition crackle rising into a 100 Hz mains hum, the shutdown, the glass shatter and the screw-in. One persistent hum voice is ramped rather than stacked, a compressor prevents clipping, and the audio context only starts after a user gesture.

Respects `prefers-reduced-motion`, has a WebGL-unavailable fallback, and lowers quality on touch devices (no shadows, lower pixel ratio).
