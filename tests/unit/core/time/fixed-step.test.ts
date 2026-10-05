import { describe, expect, it, vi } from 'vitest';
import { FixedStepper } from '../../../../src/core/time/fixed-step';

describe('FixedStepper', () => {
  it('does not call callback if dt is less than stepMs', () => {
    const stepper = new FixedStepper(16);
    const callback = vi.fn();

    const steps = stepper.update(10, callback);

    expect(steps).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it('calls callback correct number of times based on accumulator', () => {
    const stepper = new FixedStepper(16);
    const callback = vi.fn();

    // 16 * 2.5 = 40
    const steps = stepper.update(40, callback);

    expect(steps).toBe(2);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(16);
  });

  it('preserves leftover time across updates', () => {
    const stepper = new FixedStepper(16);
    const callback = vi.fn();

    // 10ms進める (まだ発火しない)
    let steps = stepper.update(10, callback);
    expect(steps).toBe(0);

    // さらに10ms進める (合計20msなので1回発火し、4ms余る)
    steps = stepper.update(10, callback);
    expect(steps).toBe(1);
    expect(callback).toHaveBeenCalledTimes(1);

    // さらに12ms進める (合計16msなので1回発火し、0ms余る)
    steps = stepper.update(12, callback);
    expect(steps).toBe(1);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('respects maxSteps and discards remaining time (to avoid spiral of death)', () => {
    const stepper = new FixedStepper(16, 5); // 最大5回
    const callback = vi.fn();

    // 16 * 10 = 160ms進める。しかしmaxSteps=5なので、5回しか呼ばれない
    const steps = stepper.update(160, callback);

    expect(steps).toBe(5);
    expect(callback).toHaveBeenCalledTimes(5);

    // 残りの時間が破棄 ( %= stepMs ) されていることを確認
    // 余りは 160 % 16 = 0 なので 0ms になっているはず
    const steps2 = stepper.update(15, callback); // まだ16に達しない
    expect(steps2).toBe(0);
  });

  it('resets accumulator correctly', () => {
    const stepper = new FixedStepper(16);
    const callback = vi.fn();

    stepper.update(10, callback);
    stepper.reset();

    // resetされたので合計20msではなく10msになり、発火しない
    const steps = stepper.update(10, callback);
    expect(steps).toBe(0);
  });
});
