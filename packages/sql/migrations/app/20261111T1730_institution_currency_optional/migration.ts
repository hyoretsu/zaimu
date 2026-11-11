#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/611bd8a9d584adf89c2b7d55058e48d963907f1003c481274aacaf18d4f36386/contract';
import startContract from '../../snapshots/611bd8a9d584adf89c2b7d55058e48d963907f1003c481274aacaf18d4f36386/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/71b2dfe9c496fe5a475bbc2fa00ed04f8c171ee25bdd1c29986d04f6bfe38641/contract';
import endContract from '../../snapshots/71b2dfe9c496fe5a475bbc2fa00ed04f8c171ee25bdd1c29986d04f6bfe38641/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropDefault({ schema: 'public', table: 'FinancialInstitution', column: 'currency' }),
      this.dropNotNull({ schema: 'public', table: 'FinancialInstitution', column: 'currency' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
