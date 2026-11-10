# UX Reviewer AR

A realistic 3D UX designer appears in your room through your phone camera (AR),
looks at your laptop, reacts with human emotions and gestures, and speaks his
feedback with lip-sync.

This is step 1 of the **Human-Like AR AI Agent** idea: the body, face, voice and AR.
Next steps: laptop Chrome extension (the agent's hands), phone–laptop pairing by
QR code, and an AI brain (Gemini) that reads your website or Figma prototype live.

## How to use

1. Open the link on an **Android phone in Chrome** (needs Google Play Services for AR).
2. Pick a reviewer (Arjun or Meera) and Standing or Sitting.
3. Tap **Start in my room (AR)**.
4. Point at your laptop and **tap it**.
5. Tap the floor (standing) or a chair seat (sitting) where he should be.
6. He reviews the design: looks at the laptop, reacts, turns to you and explains.
   Use Prev / Pause / Next. **Adjust** lets you raise, lower, turn or move him.

On a laptop, use **Watch on this screen** to see him at a 3D desk instead.

## Reviews

The review he acts out is a JSON file in `reviews/`. `latest.json` is a sample
pizza-site review. Open `/?review=my-site` to load `reviews/my-site.json`.

Each step: `area`, `severity` (critical, major, minor, good, none),
`emotion` (neutral, squint, bright, confused, frustrated, surprised, happy,
impressed, annoyed, thinking), `gesture` (wave, thumbup, thumbdown, shrug, index, ok),
`feeling`, `line` (what he says; `{me}` = his name), `fix`, optional `shot` (image path).

## Deploy on Vercel

Plain static site, no build step. Import the repo in Vercel with
Framework preset **Other**, leave build and output settings empty.

## Credits and licences

- 3D human, emotions, gestures, lip-sync: [TalkingHead](https://github.com/met4citizen/TalkingHead) by Mika Suominen, MIT (`lib/LICENSE-TalkingHead`).
- Avatars `avatarsdk.glb` (Avatar SDK / MetaPerson) and `avaturn.glb` (Avaturn) come with TalkingHead and are for **non-commercial use only**. Replace them before any commercial use.
- [three.js](https://threejs.org) r186, MIT (`lib/three/LICENSE`).
