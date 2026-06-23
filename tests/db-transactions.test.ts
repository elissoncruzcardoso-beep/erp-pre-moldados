import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { serializableTransaction } from "../src/lib/db/transactions";

test("serializableTransaction uses Serializable isolation and retries serialization conflicts", async () => {
  const optionsSeen: unknown[] = [];
  let attempts = 0;
  const prisma = {
    $transaction: async (_callback: unknown, options: unknown) => {
      attempts += 1;
      optionsSeen.push(options);

      if (attempts === 1) {
        throw new Error("could not serialize access due to concurrent update");
      }

      return "ok";
    }
  };

  const result = await serializableTransaction(prisma as never, async () => "ok");

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
  assert.deepEqual(optionsSeen, [
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 20_000
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 20_000
    }
  ]);
});
