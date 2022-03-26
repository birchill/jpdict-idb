import { DataSeries } from './data-series';
import { DataVersion } from './data-version';

// Last time we checked, if ever, we were up-to-date.
// - The `lastCheck` value specifies when we last checked.
export type IdleUpdateState = {
  state: 'idle';
  lastCheck: Date | null;
};

// We are still downloading the version metadata so we don't know yet whether
// or not we are up-to-date.
export type CheckingUpdateState = {
  state: 'checking';
  series: DataSeries;
  lastCheck: Date | null;
};

// Downloading an update.
// - The `downloadVersion` value specifies the version we are currently
//   downloading.
// - The `progress` value specifies how far we are through the update.
export type DownloadingUpdateState = {
  state: 'downloading';
  series: DataSeries;
  downloadVersion: DataVersion;
  progress: number;
  lastCheck: Date | null;
};

// Downloading has finished and we are now applying an update to the local
// database.
export type UpdatingDbUpdateState = {
  state: 'updatingdb';
  series: DataSeries;
  downloadVersion: DataVersion;
  progress: number;
  lastCheck: Date | null;
};

export type UpdateState =
  | IdleUpdateState
  | CheckingUpdateState
  | DownloadingUpdateState
  | UpdatingDbUpdateState;
