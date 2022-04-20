import { DataVersion } from './data-version';

export type UpdateStartEvent = {
  type: 'updatestart';
};

export type UpdateEndEvent = {
  type: 'updateend';
};

export type FileStartEvent = {
  type: 'filestart';
  version: DataVersion;
};

export type FileEndEvent = {
  type: 'fileend';
  version: DataVersion;
};

export type ProgressEvent = {
  type: 'progress';
  fileProgress: number;
  totalProgress: number;
};

export type ParseErrorEvent = {
  type: 'parseerror';
  message: string;
  record: Record<string, unknown>;
};

export type UpdateEvent =
  | UpdateStartEvent
  | UpdateEndEvent
  | FileStartEvent
  | FileEndEvent
  | ProgressEvent
  | ParseErrorEvent;
