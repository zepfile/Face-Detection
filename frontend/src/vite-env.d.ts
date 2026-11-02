/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_AI_STREAM_BASE_URL?: string;
  readonly VITE_AI_STREAM_URL?: string;
  readonly VITE_ENABLE_LIVE_FEED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
