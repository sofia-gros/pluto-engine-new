import { describe, expect, it } from 'vitest';
import { ObjectPool } from '../../../../src/core/memory/object-pool';

describe('ObjectPool', () => {
  it('acquires and releases objects', () => {
    let createdCount = 0;
    const pool = new ObjectPool(
      () => {
        createdCount++;
        return { val: 0 };
      },
      (obj) => {
        obj.val = 0;
      },
      2,
    );

    expect(createdCount).toBe(2);

    const obj1 = pool.acquire();
    pool.acquire();
    pool.acquire(); // プールが空なので新しく生成

    expect(createdCount).toBe(3);

    obj1.val = 10;
    pool.release(obj1);

    const obj4 = pool.acquire(); // obj1が再利用される
    expect(obj4).toBe(obj1);
    expect(obj4.val).toBe(0); // resetが呼ばれているはず
  });

  it('works without reset function and initial capacity', () => {
    let createdCount = 0;
    const pool = new ObjectPool(() => {
      createdCount++;
      return { val: 0 };
    });

    expect(createdCount).toBe(0);

    const obj1 = pool.acquire();
    expect(createdCount).toBe(1);

    obj1.val = 10;
    pool.release(obj1);

    const obj2 = pool.acquire();
    expect(obj2).toBe(obj1);
    expect(obj2.val).toBe(10); // resetがないので値が残っている
  });
});
