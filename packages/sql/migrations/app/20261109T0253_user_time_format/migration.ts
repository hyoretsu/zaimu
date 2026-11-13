#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/611bd8a9d584adf89c2b7d55058e48d963907f1003c481274aacaf18d4f36386/contract';
import endContract from '../../snapshots/611bd8a9d584adf89c2b7d55058e48d963907f1003c481274aacaf18d4f36386/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/aa5161075afdc55b0df556f27f9a4a6ba1e532c879d0b8f35c8ba32021c0264c/contract';
import startContract from '../../snapshots/aa5161075afdc55b0df556f27f9a4a6ba1e532c879d0b8f35c8ba32021c0264c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('timeFormat', 'character varying(3)', {
          notNull: true,
          default: lit('12h'),
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 3 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
