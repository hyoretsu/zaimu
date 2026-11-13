#!/usr/bin/env -S bun
import type { Contract as Start } from '../../snapshots/71b2dfe9c496fe5a475bbc2fa00ed04f8c171ee25bdd1c29986d04f6bfe38641/contract';
import startContract from '../../snapshots/71b2dfe9c496fe5a475bbc2fa00ed04f8c171ee25bdd1c29986d04f6bfe38641/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d28051f1fb0e3d0e057b3919e20ae44d17c6763894e3cfb28121b03c6cb0994b/contract';
import endContract from '../../snapshots/d28051f1fb0e3d0e057b3919e20ae44d17c6763894e3cfb28121b03c6cb0994b/contract.json' with { type: 'json' };
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
