#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5d5688852636b4777d80e49996e4cd867d1ea7daf4ce452a882f76fbe697c696/contract';
import startContract from '../../snapshots/5d5688852636b4777d80e49996e4cd867d1ea7daf4ce452a882f76fbe697c696/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/8f717b82424c7ad73f4eb88be0cea9bcf62470b45902844236752bf99611f3f4/contract';
import endContract from '../../snapshots/8f717b82424c7ad73f4eb88be0cea9bcf62470b45902844236752bf99611f3f4/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'OutboxEvent',
        column: col('telemetryContext', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
