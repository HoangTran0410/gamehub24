import { zzfxP } from "./zzfx";

// ZzFX Sound Presets
// You can use https://killedbyapixel.github.io/ZzFX/ to generate these
// example: https://codepen.io/adrianparr/pen/PoPrwdX
// https://codepen.io/KilledByAPixel/pen/BaowKzv

// prettier-ignore
export const SOUND_PRESETS = {
  // Clear, friendly chime — noticeable but not intrusive
  YOUR_TURN: [
    0.9, 0, 660, 0.02, 0.12, 0.25, 0, 1.2, 0.02, 0, 0, 0, 0, 0, 0, 0, 0, 0.85,
    0.03, 0,
  ],

  // Softer, lower, but still clearly audible
  OPPONENT_TURN: [
    0.5, 0, 392, 0.015, 0.08, 0.18, 0, 1, -0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0.6,
    0.02, 0,
  ],

  // Crisp but soft confirmation tick
  TURN_END: [
    0.35, 0, 1200, 0, 0.01, 0.04, 1, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0,
  ],

  // Gentle notification — warm, calm, but noticeable
  NOTIFY: [
    0.75, 0, 523, 0.03, 0.1, 0.22, 0, 1.1, 0.015, 0, 0, 0, 0, 0, 0, 0, 0, 0.75,
    0.04, 0,
  ],

  HU: [2,,167,.01,.14,.08,1,2.9,10,-46,,,,,,,.28,.86,.08],
  WARNING: [1.4,,428,.01,.13,.08,1,2.5,4,-9,,,,,,,.05,.92,.1],
  SOFT_SHOT: [,,413,.02,.04,.07,1,.8,-18,41,,,,,,,,.52,.06,,-1490],
  DEEP_SHOT: [,,242,.01,.13,.08,1,1.6,-5,30,,,,,,.2,,.6,.06],
  GHOST: [,,406,.03,.2,,,3.7,14,-48,,,,.9,,,,.93,.07],
  DISABLED: [,,282,,.04,.06,,2.6,-4,31,,,.19,.1,45,,,.95,.08,.07],
  EH: [1.9,,497,.02,.08,.08,1,3.1,6,-45,,,,,,,,.71,.07,,508],
  BUBBLE: [2,,188,,.07,.09,,1.1,-19,-46,,,.18,,,,.11,.53,.06],
  EAT: [1.6,,240,.02,.01,,,2,16,45,,,,,,,.05,.71,.07],
  FLY_BY_FAST: [1.6,,240,.02,.01,,,2,16,45,,,,,,,.05,.71,.07],
  PHONE_RING: [,0,1600,.13,.52,.61,1,1.1,,,,,,.1,,.14],
  BIRD: [,.3,1975,.08,.56,.02,,,-0.4,,-322,.56,.41,,,,.25],
  SCORE_UP: [,,20,.04,,.6,,1.31,,,-990,.06,.17,,,.04,.07],
  HEART_HIT: [,,528,.01,,.48,,.6,-11.6,,,,.32,4.2],
  STAR_LONG: [,,190,.03,.4,.9,,.76,1.56,,219,.01,.06,.1,,,.14],
  COIN: [,,1675,,.06,.24,1,1.82,,,837,.06],
  DRUM: [,,129,.01,,.15,,,,,,,,5],
  UFO: [,,172,.8,,.8,1,.76,7.7,3.73,-482,.08,.15,,.14],
  WAVE: [,.2,40,.5,,1.5,,11,,,,,,199],
  AMBULANCE: [,0,960,,1,.01,,.8,-0.01,,-190,.5,,.05,,,1],

  END_GAME: [,,349.2282,.03,.46,.69,,1.2,.1,.5,-100,.22,,,,,,.7,.13,1],

  click: [0.4, 0.5, 1600, , 0.01, 0.01, 1, 3, , , , , , , , , , 0.5, 0.01],
  tick: [0.5, , 1000, , 0.01, 0.01, 1, 1, , , , , , , , , , 0.5, 0.01],
  tick2: [1.6,,10,.03,,.01,1,1.2,-68,,,,,.8,,,.08,.85,.01,,-980]
};

class SoundManager {
  private static instance: SoundManager;
  private isMuted: boolean = false;
  private volume: number = 1.0;

  private constructor() {
    // Check if user has muted sounds in localStorage
    const savedMuted = localStorage.getItem("game_sounds_muted");
    if (savedMuted === "true") {
      this.isMuted = true;
    }

    const savedVolume = localStorage.getItem("game_sounds_volume");
    if (savedVolume !== null) {
      this.volume = parseFloat(savedVolume);
    }
  }

  private static get(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  /**
   * Play any sound preset or custom ZzFX array
   */
  public static play(sound: string | (number | undefined)[]) {
    const manager = SoundManager.get();
    if (manager.isMuted) return;

    try {
      let soundArray: (number | undefined)[] | null = null;
      if (Array.isArray(sound)) {
        soundArray = [...sound];
      } else if (typeof sound === "string" && sound in SOUND_PRESETS) {
        soundArray = [...SOUND_PRESETS[sound as keyof typeof SOUND_PRESETS]];
      }

      if (soundArray) {
        // ZzFX volume is the first element in the array
        // We multiply it by our global volume setting
        const originalVolume = (soundArray[0] as number) ?? 1;
        soundArray[0] = originalVolume * manager.volume;
        zzfxP(...soundArray);
      }
    } catch (e) {
      console.warn("Failed to play sound:", e);
    }
  }

  // Helper static methods for common presets
  public static playTurnSwitch(isMyTurn: boolean) {
    // this.play(SOUND_PRESETS.TURN_END);
    // setTimeout(() => {
    if (isMyTurn) {
      this.play(SOUND_PRESETS.YOUR_TURN);
    } else {
      this.play(SOUND_PRESETS.OPPONENT_TURN);
    }
    // }, 150);
  }

  public static playNotify() {
    this.play(SOUND_PRESETS.NOTIFY);
  }

  public static playGameOver() {
    this.play(SOUND_PRESETS.END_GAME);
  }

  public static setMuted(muted: boolean) {
    const manager = SoundManager.get();
    manager.isMuted = muted;
    localStorage.setItem("game_sounds_muted", muted.toString());
  }

  public static toggleMute() {
    this.setMuted(!this.getMuted());
  }

  public static getMuted() {
    return SoundManager.get().isMuted;
  }

  public static setVolume(volume: number) {
    const manager = SoundManager.get();
    manager.volume = Math.max(0, Math.min(1, volume));
    localStorage.setItem("game_sounds_volume", manager.volume.toString());
  }

  public static getVolume() {
    return SoundManager.get().volume;
  }
}

export default SoundManager;
