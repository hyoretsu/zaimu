#!/usr/bin/env -S bun
import type { Contract as End } from '../../snapshots/432e5b50941f47b4600d0b2a3383d26da101bcd4e07ef262a48e1c491e1cde2d/contract';
import endContract from '../../snapshots/432e5b50941f47b4600d0b2a3383d26da101bcd4e07ef262a48e1c491e1cde2d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/aa5161075afdc55b0df556f27f9a4a6ba1e532c879d0b8f35c8ba32021c0264c/contract';
import startContract from '../../snapshots/aa5161075afdc55b0df556f27f9a4a6ba1e532c879d0b8f35c8ba32021c0264c/contract.json' with { type: 'json' };
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
