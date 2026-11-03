#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2251ee5f545dd0cca27f5fab97b8c9d282d67a0b0f8a3278e8486ca48e0f9b58/contract';
import startContract from '../../snapshots/2251ee5f545dd0cca27f5fab97b8c9d282d67a0b0f8a3278e8486ca48e0f9b58/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5c0c1d3b21183e779bd6966ec7d962a3588da1a7991ca905a2c1a6e05645b259/contract';
import endContract from '../../snapshots/5c0c1d3b21183e779bd6966ec7d962a3588da1a7991ca905a2c1a6e05645b259/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'FinancialAccount',
        column: col('yieldTaxModes', 'json', { codecRef: { codecId: 'pg/json@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'FinancialAccountYieldRateHistory',
        column: col('yieldTaxModes', 'json', { codecRef: { codecId: 'pg/json@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'FinancialInstitutionYieldPolicy',
        column: col('yieldTaxModes', 'json', { codecRef: { codecId: 'pg/json@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
