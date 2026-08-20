import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const edge = 13;
const logoWidth = 475;
const logoHeight = (logoWidth * 622) / 1120;
const xPhase = 0.137;
const yPhase = 0.411;
const logoColors = ["#ff3b30", "#ff2bd6", "#3b6cff", "#00d7ff", "#ff3b30"];

const triangleWave = (phase: number) => {
  const wrappedPhase = ((phase % 1) + 1) % 1;
  return 1 - Math.abs(wrappedPhase * 2 - 1);
};

const completedBounces = (progress: number, phase: number) =>
  Math.floor((progress + phase) * 2) - Math.floor(phase * 2);

export const InStoreScreensaver: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, height, width } = useVideoConfig();
  const progress = frame / durationInFrames;

  const x = edge + triangleWave(progress + xPhase) * (width - logoWidth - edge * 2);
  const y = edge + triangleWave(progress + yPhase) * (height - logoHeight - edge * 2);
  const bounceCount =
    completedBounces(progress, xPhase) + completedBounces(progress, yPhase);
  const logoColor = logoColors[bounceCount];
  const logoSource = `${staticFile("screensaver-logo.svg")}#changing-places-logo-artwork`;

  return (
    <AbsoluteFill
      name="Black screen"
      style={{
        backgroundColor: "#000000",
      }}
    >
      <svg
        aria-label="Changing Places Consignment Shop logo"
        role="img"
        viewBox="0 0 1120 622"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: logoWidth,
          height: logoHeight,
          color: logoColor,
          translate: `${x}px ${y}px`,
        }}
      >
        <use href={logoSource} />
      </svg>
    </AbsoluteFill>
  );
};
