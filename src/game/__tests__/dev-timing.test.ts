import { describe, it, expect } from 'vitest';
import { withSlowActionWarning, SLOW_ACTION_MS } from '../dev-timing';

type State = { count: number };
type Action = { type: string };

function harness(elapsedMs: number) {
  let time = 0;
  const warnings: string[] = [];
  const reducer = (state: State, _action: Action): State => {
    time += elapsedMs; // the reducer "takes" elapsedMs on the fake clock
    return { count: state.count + 1 };
  };
  const wrapped = withSlowActionWarning<State, Action>(
    reducer,
    () => time,
    (message) => warnings.push(message)
  );
  return { wrapped, warnings };
}

describe('withSlowActionWarning', () => {
  it('returns the wrapped reducer result unchanged', () => {
    const { wrapped } = harness(1);
    expect(wrapped({ count: 0 }, { type: 'tick' })).toEqual({ count: 1 });
  });

  it('stays silent for actions under the frame budget', () => {
    const { wrapped, warnings } = harness(SLOW_ACTION_MS - 1);
    wrapped({ count: 0 }, { type: 'chooseNode' });
    expect(warnings).toEqual([]);
  });

  it('warns with the action type and duration for slow actions', () => {
    const { wrapped, warnings } = harness(SLOW_ACTION_MS + 4);
    wrapped({ count: 0 }, { type: 'chooseNode' });
    expect(warnings).toEqual([`[run] slow action chooseNode: ${(SLOW_ACTION_MS + 4).toFixed(1)}ms`]);
  });
});
