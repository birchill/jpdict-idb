import { DataSeries } from './data-series';
import { DataVersion } from './data-version';

// Last time we checked, if ever, we were up-to-date.
// - The `lastCheck` value specifies when we last checked.
export type IdleUpdateState = {
  type: 'idle';
  lastCheck: Date | null;
};

// We are still downloading the version metadata so we don't know yet whether
// or not we are up-to-date.
//
// - The `series` member specifies the specific data series we are checking.
//   Recall that for the kanji major data series, we have two parts: kanji +
//   radicals.
export type CheckingUpdateState = {
  type: 'checking';
  series: DataSeries;
  lastCheck: Date | null;
};

// Downloading/applying an update.
//
// - The `version` value specifies the file we are currently
//   downloading/applying.
// - The `series` value is as with the 'checking' state.
// - The `fileProgress` value specifies how far we are through the file.
// - The `totalProgress` value specifies how far we are through the overall
//   update.
export type UpdatingUpdateState = {
  type: 'updating';
  series: DataSeries;
  version: DataVersion;
  fileProgress: number;
  totalProgress: number;
  lastCheck: Date | null;
};

export type UpdateState =
  | IdleUpdateState
  | CheckingUpdateState
  | UpdatingUpdateState;
