#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5c0c1d3b21183e779bd6966ec7d962a3588da1a7991ca905a2c1a6e05645b259/contract';
import startContract from '../../snapshots/5c0c1d3b21183e779bd6966ec7d962a3588da1a7991ca905a2c1a6e05645b259/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/43df9ed47162e03bad16081a66c7b6def250677a70a523e18d65a8a479f74c31/contract';
import endContract from '../../snapshots/43df9ed47162e03bad16081a66c7b6def250677a70a523e18d65a8a479f74c31/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';
import { readFileSync } from 'node:fs';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [rawSql({
      id: 'multiAssetWallet.cutover',
      invariantId: 'multiAssetWallet.explicitDenominations.v1',
      label: 'Preserve native amounts and historical denominations in per-asset holdings',
      operationClass: 'data', target: { id: 'postgres' }, precheck: [],
      execute: [{ description: 'Transactional native asset cutover', sql: readFileSync(new URL('./cutover.sql', import.meta.url), 'utf8') }],
      postcheck: [{ description: 'Scalar account fields removed and asset holdings available', sql: `SELECT to_regclass('public."FinancialAccountAsset"') IS NOT NULL AND to_regclass('public."AssetQuoteSnapshot"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='FinancialAccount' AND column_name IN ('currency','balance')) AS result` }],
    })];
  }
}

MigrationCLI.run(import.meta.url, M);
