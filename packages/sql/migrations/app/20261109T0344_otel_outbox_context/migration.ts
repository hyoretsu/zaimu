#!/usr/bin/env -S bun
import type { Contract as Start } from '../../snapshots/611bd8a9d584adf89c2b7d55058e48d963907f1003c481274aacaf18d4f36386/contract';
import startContract from '../../snapshots/611bd8a9d584adf89c2b7d55058e48d963907f1003c481274aacaf18d4f36386/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/a2f0ff9ed53d42765bfb9365debf2193af4f8d3e3581615748290dd8cf033baf/contract';
import endContract from '../../snapshots/a2f0ff9ed53d42765bfb9365debf2193af4f8d3e3581615748290dd8cf033baf/contract.json' with { type: 'json' };
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
