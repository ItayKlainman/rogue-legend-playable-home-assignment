import { Assets, Texture } from 'pixi.js';
import crack0 from 'assets/egg-crack/egg/crack_0.webp';
import crack1 from 'assets/egg-crack/egg/crack_1.webp';
import crack2 from 'assets/egg-crack/egg/crack_2.webp';
import crack3 from 'assets/egg-crack/egg/crack_3.webp';
import crack4 from 'assets/egg-crack/egg/crack_4.webp';
import crack5 from 'assets/egg-crack/egg/crack_5.webp';

export { loadEggArt, loadRevealTexture, loadSummonTexture, loadUiTexture } from '../egg-summon/catalog';

// Index 0 = pristine (idle, pre-tap); 1-5 = progressive cracks shown on taps 1-5.
const CRACK_DATA = [crack0, crack1, crack2, crack3, crack4, crack5];

/** Load the 6 crack-stage textures (0 = pristine idle, 1-5 = taps 1-5). */
export async function loadCrackArt(): Promise<Texture[]> {
  return Promise.all(CRACK_DATA.map((d) => Assets.load(d)));
}
