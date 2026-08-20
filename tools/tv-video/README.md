# Changing Places 4K in-store screensaver source

This Remotion composition produces the video used by `/tv/video`. It uses the
same wide, color-changing logo as `/tv`. Colors change on wall
bounces, and the 31-second path closes exactly so the position, velocity, and
color all remain continuous across the loop.

## Output

- 3840 x 2160
- 60 fps
- 31 seconds (1,860 frames)
- No audio
- Opaque black background

The render script encodes HEVC Main Level 5.1, remuxes the result with an
`hvc1` sample entry, and then creates a broadly compatible H.264/AVC fallback.
Both outputs include BT.709 metadata and fast-start layout, and both are
verified against the Cloudflare asset-size limit. The deployed files are:

`../../tv/media/screensaver-4k-avc.mp4`
`../../tv/media/screensaver-4k-hevc.mp4`

## Commands

```powershell
pnpm install
pnpm lint
pnpm run render
```
