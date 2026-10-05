export function readChannelPointer<T>(options: {
  root: string;
  channel: string;
  /** Reads one URL; a failed answer throws an error carrying its HTTP `status`. */
  read: (url: string) => Promise<T>;
  warn?: (message: string) => void;
}): Promise<T>;
