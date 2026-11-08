#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/43df9ed47162e03bad16081a66c7b6def250677a70a523e18d65a8a479f74c31/contract';
import startContract from '../../snapshots/43df9ed47162e03bad16081a66c7b6def250677a70a523e18d65a8a479f74c31/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/aa5161075afdc55b0df556f27f9a4a6ba1e532c879d0b8f35c8ba32021c0264c/contract';
import endContract from '../../snapshots/aa5161075afdc55b0df556f27f9a4a6ba1e532c879d0b8f35c8ba32021c0264c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'TransactionImportItem',
        column: col('destinationAmount', 'numeric(38,18)', {
          codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 38, scale: 18 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'TransactionImportItem',
        column: col('fees', 'json', {
          notNull: true,
          default: fn(sql`'[]'::json`),
          codecRef: { codecId: 'pg/json@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
