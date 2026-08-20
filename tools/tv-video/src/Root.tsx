import "./index.css";
import { Composition } from "remotion";
import { InStoreScreensaver } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="InStoreScreensaver"
      component={InStoreScreensaver}
      durationInFrames={1860}
      fps={60}
      width={3840}
      height={2160}
    />
  );
};
