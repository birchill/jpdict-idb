import type { DataSeries } from './data-series.js';
import type { UpdateEvent } from './update-events.js';
import type { UpdateState } from './update-state.js';

export type UpdateAction =
  | UpdateEvent
  | { type: 'start'; series: DataSeries }
  | { type: 'end'; checkDate: Date }
  | { type: 'error'; checkDate: Date | null };

export function reducer(state: UpdateState, action: UpdateAction): UpdateState {
  switch (action.type) {
    case 'start':
      return {
        type: 'checking',
        series: action.series,
        lastCheck: state.lastCheck,
      };

    case 'end':
      return { type: 'idle', lastCheck: action.checkDate };

    case 'error':
      return { type: 'idle', lastCheck: action.checkDate || state.lastCheck };

    case 'updatestart':
    case 'updateend':
      // Nothing to do here since the 'start' and 'end' events take care of
      // initialization and returning to the 'idle' state.
      //
      // (Furthermore, the 'start' event comes before the 'updatestart'
      // event--which only comes after we've fetched the version file and
      // confirmed there is something to update--so it's a more suitable queue
      // for transitioning to the 'checking' state.)
      return state;

    case 'filestart':
      if (state.type === 'idle') {
        console.error('Should not get filestart event in the idle state');
        return state;
      }

      return {
        type: 'updating',
        series: state.series,
        version: action.version,
        fileProgress: 0,
        totalProgress: state.type === 'updating' ? state.totalProgress : 0,
        lastCheck: state.lastCheck,
      };

    case 'fileend':
      // Nothing to do here -- the 'progress' action will take care of updating
      // the progress and the 'end' action will take care returning to the
      // 'idle' state once all is complete.
      return state;

    case 'progress':
      if (state.type !== 'updating') {
        console.error(`Should not get progress event in '${state.type}' state`);
        return state;
      }

      return {
        ...state,
        fileProgress: action.fileProgress,
        totalProgress: action.totalProgress,
      };

    case 'parseerror':
      // Nothing to do here
      return state;
  }
}
