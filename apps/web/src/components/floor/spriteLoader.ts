export type SpriteSheetType = "idle" | "idleAnim" | "run" | "phone";
export type CharacterName = "Adam" | "Alex" | "Amelia" | "Bob";
export type FurnitureSheetName = "desk" | "props" | "large" | "tiles" | "nyse-elements" | "nyse-floor-tiles";

/** Keys for standalone (non-sheet) external sprites */
export type ExtSpriteKey =
    | "ext-boss-desk"
    | "ext-big-plant"
    | "ext-bookshelf"
    | "ext-tall-bookshelf"
    | "ext-wall-graph"
    | "ext-filing-tall";

const cache = new Map<string, HTMLImageElement>();

function preloadImage(key: string, src: string): Promise<HTMLImageElement> {
    if (cache.has(key)) return Promise.resolve(cache.get(key)!);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            cache.set(key, img);
            resolve(img);
        };
        img.onerror = () => {
            // Resolve with a placeholder so one missing sprite doesn't crash the scene
            resolve(new Image());
        };
        img.src = src;
    });
}

export async function preloadAllSprites(): Promise<void> {
    const names: CharacterName[] = ["Adam", "Alex", "Amelia", "Bob"];
    const promises: Promise<HTMLImageElement>[] = [];

    for (const name of names) {
        promises.push(preloadImage(`${name}_idle`,     `/sprites/characters/${name}_idle_16x16.png`));
        promises.push(preloadImage(`${name}_idleAnim`, `/sprites/characters/${name}_idle_anim_16x16.png`));
        promises.push(preloadImage(`${name}_run`,      `/sprites/characters/${name}_run_16x16.png`));
        promises.push(preloadImage(`${name}_phone`,    `/sprites/characters/${name}_phone_16x16.png`));
    }

    // Room-builder classic tile sheet
    promises.push(preloadImage("tileSheet", "/sprites/tiles/Room_Builder_free_16x16.png"));

    // Wall Street furniture sheets
    promises.push(preloadImage("furniture_desk",  "/sprites/furniture/ws-desk-furniture.png"));
    promises.push(preloadImage("furniture_props", "/sprites/furniture/ws-office-props.png"));
    promises.push(preloadImage("furniture_large", "/sprites/furniture/ws-large-objects.png"));
    promises.push(preloadImage("furniture_tiles", "/sprites/furniture/ws-floor-tiles.png"));

    // NYSE trading floor sheets
    promises.push(preloadImage("furniture_nyse-elements",   "/sprites/furniture/nyse-elements.png"));
    promises.push(preloadImage("furniture_nyse-floor-tiles","/sprites/furniture/nyse-floor-tiles.png"));

    // NYSE standalone sprites
    promises.push(preloadImage("nyse-monitor-pod",  "/sprites/furniture/nyse-monitor-pod.png"));
    promises.push(preloadImage("nyse-monitor-bank", "/sprites/furniture/nyse-monitor-bank.png"));

    // Individual external sprites (Office-Furniture-Pixel-Art pack)
    promises.push(preloadImage("ext-boss-desk",      "/sprites/furniture/ext-boss-desk.png"));
    promises.push(preloadImage("ext-big-plant",      "/sprites/furniture/ext-big-plant.png"));
    promises.push(preloadImage("ext-bookshelf",      "/sprites/furniture/ext-bookshelf.png"));
    promises.push(preloadImage("ext-tall-bookshelf", "/sprites/furniture/ext-tall-bookshelf.png"));
    promises.push(preloadImage("ext-wall-graph",     "/sprites/furniture/ext-wall-graph.png"));
    promises.push(preloadImage("ext-filing-tall",    "/sprites/furniture/ext-filing-tall.png"));

    await Promise.all(promises);
}

export function getSpriteSheet(name: CharacterName, type: SpriteSheetType): HTMLImageElement | undefined {
    return cache.get(`${name}_${type}`);
}

export function getTileSheet(): HTMLImageElement | undefined {
    return cache.get("tileSheet");
}

export function getFurnitureSheet(name: FurnitureSheetName): HTMLImageElement | undefined {
    return cache.get(`furniture_${name}`);
}

/** Returns a standalone (non-sheet) external sprite by its key string. */
export function getExternalSprite(key: string): HTMLImageElement | undefined {
    return cache.get(key);
}

/** Convenience: fetch the NYSE floor tile sheet */
export function getNyseTileSheet(): HTMLImageElement | undefined {
    return cache.get("furniture_nyse-floor-tiles");
}

/**
 * Wall Street floor tile sheet — 4 cols × 2 rows.
 *  (0,0) white marble    (1,0) dark marble+gold  (2,0) cream tile   (3,0) dark walnut
 *  (0,1) dark walnut 2   (1,1) light oak          (2,1) teal carpet  (3,1) —
 */
export const WS_FLOOR_TILE_COLS = 4;
export const WS_FLOOR_TILE_ROWS = 2;
