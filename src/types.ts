export interface Subtitle {
  id: number | string;
  startTime: number;
  endTime: number;
  text: string;
}

export interface VideoState {
  videoId: string;
  title: string;
  status: "playing" | "paused";
  currentTime: number;
  timestamp: number; // For sync calculation
}
