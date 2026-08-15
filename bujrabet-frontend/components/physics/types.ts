import type { PublicApi } from "@react-three/cannon";
import type * as THREE from "three";
import type { SymbolKey } from "@/lib/types";

export type DiceSettleResult = {
  index: number;
  topFace: SymbolKey;
};

export type DiceApi = PublicApi;

export type DiceMeshRef = React.RefObject<THREE.Mesh>;

export type BucketApis = {
  bottom: PublicApi;
  left: PublicApi;
  right: PublicApi;
  front: PublicApi;
  back: PublicApi;
  lid: PublicApi;
};
