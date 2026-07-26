import React from "react";
import { Composition } from "remotion";
import { MomAndBaby } from "./MomAndBaby";
import {
  MothersDayReel,
  MOTHERS_DAY_TOTAL_FRAMES,
} from "./MothersDayReel";
import { MomsTired, MOMS_TIRED_TOTAL } from "./MomsTired";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MomAndBaby"
        component={MomAndBaby}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="MothersDayReel"
        component={MothersDayReel}
        durationInFrames={MOTHERS_DAY_TOTAL_FRAMES}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="MomsTired"
        component={MomsTired}
        durationInFrames={MOMS_TIRED_TOTAL}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
