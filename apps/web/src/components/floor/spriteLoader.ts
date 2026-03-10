export type SpriteSheetType = "idle" | "idleAnim" | "run" | "phone";
export type CharacterName = "Adam" | "Alex" | "Amelia" | "Bob";

const cache = new Map<string, HTMLImageElement>();

/**
 * Ensures a sprite sheet is loaded into memory.
 */
function preloadImage(key: string, src: string): Promise<HTMLImageElement> {
    if (cache.has(key)) return Promise.resolve(cache.get(key)!);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            cache.set(key, img);
            resolve(img);
        };
        img.onerror = (err) => reject(err);
        img.src = src;
    });
}

export async function preloadAllSprites(): Promise<void> {
    const names: CharacterName[] = ["Adam", "Alex", "Amelia", "Bob"];
    const types: SpriteSheetType[] = ["idle", "idleAnim", "run", "phone"];

    const promises: Promise<HTMLImageElement>[] = [];

    for (const name of names) {
        promises.push(preloadImage(`${name}_idle`, `/sprites/characters/${name}_idle_16x16.png`));
        promises.push(preloadImage(`${name}_idleAnim`, `/sprites/characters/${name}_idle_anim_16x16.png`));
        promises.push(preloadImage(`${name}_run`, `/sprites/characters/${name}_run_16x16.png`));
        promises.push(preloadImage(`${name}_phone`, `/sprites/characters/${name}_phone_16x16.png`));
    }

    promises.push(preloadImage("tileSheet", "/sprites/tiles/Room_Builder_free_16x16.png"));

    await Promise.all(promises);
}

export function getSpriteSheet(name: CharacterName, type: SpriteSheetType): HTMLImageElement | undefined {
    return cache.get(`${name}_${type}`);
}

export function getTileSheet(): HTMLImageElement | undefined {
    return cache.get("tileSheet");
}
