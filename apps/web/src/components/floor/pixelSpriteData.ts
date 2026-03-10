export type CharacterName = "Adam" | "Alex" | "Amelia" | "Bob";

export const CHARACTER_NAMES: CharacterName[] = ["Adam", "Alex", "Amelia", "Bob"];

export interface NpcTrader {
  /** Unique id */
  id: string;
  /** Display name shown under the sprite */
  name: string;
  /** Chosen character name for sprite loading */
  charName: CharacterName;
  /** Fractional X position [0, 1] within the floor area */
  posX: number;
  /** Fractional Y position [0, 1] within the floor area */
  posY: number;
  /** Which direction the NPC faces: 'down' | 'right' | 'left' | 'up' */
  facing: "down" | "right" | "left" | "up";
}

/** Pre-placed NPC traders that populate the floor even with no real users */
export const DEMO_NPC_TRADERS: NpcTrader[] = [
  { id: "npc-1", name: "SatMax", charName: "Adam", posX: 0.12, posY: 0.30, facing: "down" },
  { id: "npc-2", name: "Degen_Ape", charName: "Alex", posX: 0.30, posY: 0.55, facing: "right" },
  { id: "npc-3", name: "OpWhale", charName: "Amelia", posX: 0.52, posY: 0.25, facing: "down" },
  { id: "npc-4", name: "TokenMage", charName: "Bob", posX: 0.70, posY: 0.60, facing: "left" },
  { id: "npc-5", name: "ChainBot", charName: "Adam", posX: 0.85, posY: 0.35, facing: "down" },
  { id: "npc-6", name: "RuneHuntr", charName: "Bob", posX: 0.42, posY: 0.75, facing: "right" },
  { id: "npc-7", name: "0xPump", charName: "Alex", posX: 0.18, posY: 0.70, facing: "up" },
  { id: "npc-8", name: "MintLord", charName: "Amelia", posX: 0.63, posY: 0.45, facing: "left" },
];
