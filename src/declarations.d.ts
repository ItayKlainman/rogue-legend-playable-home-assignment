// Webpack-injected globals (via DefinePlugin)
declare const __DEV__: boolean;
declare const AD_NETWORK: string;
declare const PLAYABLE_TYPE: string;
declare const PLAYABLE_VARIANT: string;
declare const GOOGLE_PLAY_URL: string;
declare const APP_STORE_URL: string;

declare module '*.atlas' {
  const content: string;
  export default content;
}

// webpack asset/source returns raw text for these types
declare module '*.json' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string; // base64 data URL (webpack asset/inline)
  export default content;
}

declare module '*.jpg' {
  const content: string; // base64 data URL (webpack asset/inline)
  export default content;
}

declare module '*.webp' {
  const content: string; // base64 data URL (webpack asset/inline)
  export default content;
}

declare module '*.mp3' {
  const content: string; // base64 data URL (webpack asset/inline)
  export default content;
}

declare module '*.css';

declare module '*.wav' {
  const content: string; // base64 data URL (webpack asset/inline)
  export default content;
}

declare module '*.ttf' {
  const content: string; // base64 data URL (webpack asset/inline)
  export default content;
}

declare module '*.otf' {
  const content: string; // base64 data URL (webpack asset/inline)
  export default content;
}
